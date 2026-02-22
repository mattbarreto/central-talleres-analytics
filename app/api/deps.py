from typing import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_token
from app.core.token_store import revoked_token_store
from app.db.session import SessionLocal
from app.models.admin import Admin


oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_admin(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> str:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
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
