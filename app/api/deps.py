from typing import Generator

from fastapi import Cookie, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.core.token_store import revoked_token_store
from app.db.session import SessionLocal
from app.models.admin import Admin


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_token_from_cookie(tc_access_token: str | None = Cookie(default=None)) -> str:
    """Extract access token exclusively from the tc_access_token HttpOnly cookie.
    No Bearer header fallback — cookies-only auth policy.
    """
    if not tc_access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado",
        )
    return tc_access_token


def get_current_admin(
    token: str = Depends(get_token_from_cookie),
    db: Session = Depends(get_db),
) -> str:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = decode_token(token)
        email: str | None = payload.get("sub")
        token_type = payload.get("type")
        token_jti = payload.get("jti")
        if email is None or not isinstance(email, str) or token_type != "access":
            raise credentials_exception
        if token_jti and revoked_token_store.is_revoked(str(token_jti)):
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc
    admin = db.query(Admin).filter(Admin.email == email.lower()).first()
    if not admin:
        raise credentials_exception
    return email
