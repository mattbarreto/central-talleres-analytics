from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db, get_token_from_cookie
from app.core.config import settings
from app.core.rate_limit import SlidingWindowRateLimiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    token_expiration,
    verify_password,
)
from app.core.token_store import revoked_token_store, used_refresh_token_store
from app.models.admin import Admin
from app.schemas.auth import LoginRequest, LoginResponse


router = APIRouter(prefix="/auth", tags=["auth"])
login_rate_limiter = SlidingWindowRateLimiter(
    max_attempts=settings.auth_rate_limit_max_attempts,
    window_seconds=settings.auth_rate_limit_window_seconds,
)

_ACCESS_COOKIE = "tc_access_token"
_REFRESH_COOKIE = "tc_refresh_token"
_REFRESH_COOKIE_PATH = "/api/v1/auth/refresh"


def _rate_limit_keys(request: Request, email: str) -> tuple[str, str]:
    client_ip = request.client.host if request.client else "unknown"
    normalized_email = email.strip().lower()
    return (f"ip:{client_ip}", f"email:{normalized_email}")


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set both auth cookies with full security flags."""
    response.set_cookie(
        key=_ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
        max_age=settings.access_token_expire_minutes * 60,
    )
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path=_REFRESH_COOKIE_PATH,
        max_age=settings.refresh_token_expire_minutes * 60,
    )


def _clear_auth_cookies(response: Response) -> None:
    """Clear both auth cookies. Path must match the Set-Cookie path exactly."""
    response.delete_cookie(key=_ACCESS_COOKIE, path="/", httponly=True, secure=settings.cookie_secure, samesite=settings.cookie_samesite)
    response.delete_cookie(key=_REFRESH_COOKIE, path=_REFRESH_COOKIE_PATH, httponly=True, secure=settings.cookie_secure, samesite=settings.cookie_samesite)


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    keys = _rate_limit_keys(request, payload.email)
    if not all(login_rate_limiter.allow(key) for key in keys):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos de inicio de sesion. Intenta nuevamente en unos minutos.",
        )
    admin = db.query(Admin).filter(Admin.email == payload.email.lower()).first()
    if not admin or not verify_password(payload.password, admin.password_hash):
        for key in keys:
            login_rate_limiter.register_failure(key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    for key in keys:
        login_rate_limiter.clear(key)

    access_token = create_access_token(subject=admin.email)
    refresh_token = create_refresh_token(subject=admin.email)
    _set_auth_cookies(response, access_token, refresh_token)
    return LoginResponse(email=admin.email)


@router.post("/refresh", response_model=LoginResponse)
def refresh_access_token(
    response: Response,
    db: Session = Depends(get_db),
    tc_refresh_token: str | None = Cookie(default=None),
) -> LoginResponse:
    """Rotate tokens using the tc_refresh_token cookie exclusively.
    No body fallback — cookies-only policy.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    if not tc_refresh_token:
        raise credentials_exception

    try:
        token_payload = decode_token(tc_refresh_token)
        if token_payload.get("type") != "refresh":
            raise credentials_exception
        email = str(token_payload.get("sub") or "").lower()
        refresh_jti = str(token_payload.get("jti") or "")
        if not email or not refresh_jti:
            raise credentials_exception
        if used_refresh_token_store.is_revoked(refresh_jti) or revoked_token_store.is_revoked(refresh_jti):
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    admin = db.query(Admin).filter(Admin.email == email).first()
    if not admin:
        raise credentials_exception

    used_refresh_token_store.revoke(refresh_jti, token_expiration(token_payload))
    access_token = create_access_token(subject=admin.email)
    new_refresh_token = create_refresh_token(subject=admin.email)
    _set_auth_cookies(response, access_token, new_refresh_token)
    return LoginResponse(email=admin.email)


@router.post("/logout")
def logout(
    response: Response,
    token: str = Depends(get_token_from_cookie),
    tc_refresh_token: str | None = Cookie(default=None),
) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        access_payload = decode_token(token)
        token_type = access_payload.get("type")
        if token_type not in {"access", "refresh"}:
            raise credentials_exception
        token_jti = str(access_payload.get("jti") or "")
        email = str(access_payload.get("sub") or "").lower()
        if not token_jti or not email:
            raise credentials_exception
        if token_type == "refresh":
            used_refresh_token_store.revoke(token_jti, token_expiration(access_payload))
        else:
            revoked_token_store.revoke(token_jti, token_expiration(access_payload))
    except JWTError as exc:
        raise credentials_exception from exc

    if tc_refresh_token:
        try:
            refresh_payload = decode_token(tc_refresh_token)
            if refresh_payload.get("type") == "refresh":
                refresh_jti = str(refresh_payload.get("jti") or "")
                refresh_email = str(refresh_payload.get("sub") or "").lower()
                if refresh_jti and refresh_email == email:
                    used_refresh_token_store.revoke(refresh_jti, token_expiration(refresh_payload))
        except JWTError:
            pass  # best-effort: cookie may be expired/invalid, still clear it

    _clear_auth_cookies(response)
    return {"detail": "Sesion cerrada"}


@router.get("/me", response_model=LoginResponse)
def me(
    response: Response,
    email: str = Depends(get_current_admin),
) -> LoginResponse:
    """Lightweight session-check endpoint.
    The frontend calls this on page load to restore session state.
    """
    response.headers["Cache-Control"] = "no-store"
    return LoginResponse(email=email)
