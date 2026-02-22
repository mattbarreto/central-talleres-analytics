from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.api.deps import get_db, oauth2_scheme
from app.core.config import settings
from app.core.rate_limit import SlidingWindowRateLimiter
from app.core.security import create_access_token, create_refresh_token, decode_token, token_expiration, verify_password
from app.core.token_store import revoked_token_store, used_refresh_token_store
from app.models.admin import Admin
from app.schemas.auth import LoginRequest, LogoutRequest, RefreshTokenRequest, Token


router = APIRouter(prefix="/auth", tags=["auth"])
login_rate_limiter = SlidingWindowRateLimiter(
    max_attempts=settings.auth_rate_limit_max_attempts,
    window_seconds=settings.auth_rate_limit_window_seconds,
)


def _rate_limit_keys(request: Request, email: str) -> tuple[str, str]:
    client_ip = request.client.host if request.client else "unknown"
    normalized_email = email.strip().lower()
    return (f"ip:{client_ip}", f"email:{normalized_email}")


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
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
    return Token(
        access_token=create_access_token(subject=admin.email),
        refresh_token=create_refresh_token(subject=admin.email),
    )


@router.post("/refresh", response_model=Token)
def refresh_access_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token_payload = decode_token(payload.refresh_token)
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
    return Token(
        access_token=create_access_token(subject=admin.email),
        refresh_token=create_refresh_token(subject=admin.email),
    )


@router.post("/logout")
def logout(
    payload: LogoutRequest | None = Body(default=None),
    token: str = Depends(oauth2_scheme),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
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

    refresh_token = payload.refresh_token if payload else None
    if refresh_token:
        try:
            refresh_payload = decode_token(refresh_token)
            if refresh_payload.get("type") != "refresh":
                raise credentials_exception
            refresh_jti = str(refresh_payload.get("jti") or "")
            refresh_email = str(refresh_payload.get("sub") or "").lower()
            if not refresh_jti or not refresh_email or refresh_email != email:
                raise credentials_exception
            used_refresh_token_store.revoke(refresh_jti, token_expiration(refresh_payload))
        except JWTError as exc:
            raise credentials_exception from exc
    return {"detail": "Sesion cerrada"}
