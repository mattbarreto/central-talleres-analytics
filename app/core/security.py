from datetime import UTC, datetime, timedelta
from typing import Any, Optional
from uuid import uuid4

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str, expires_minutes: Optional[int] = None) -> str:
    if expires_minutes is None:
        expires_minutes = settings.access_token_expire_minutes
    expire = datetime.now(UTC) + timedelta(minutes=expires_minutes)
    to_encode: dict[str, Any] = {
        "exp": expire,
        "sub": subject,
        "type": "access",
        "jti": str(uuid4()),
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(subject: str, expires_minutes: Optional[int] = None) -> str:
    if expires_minutes is None:
        expires_minutes = settings.refresh_token_expire_minutes
    expire = datetime.now(UTC) + timedelta(minutes=expires_minutes)
    to_encode: dict[str, Any] = {
        "exp": expire,
        "sub": subject,
        "type": "refresh",
        "jti": str(uuid4()),
    }
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])


def token_expiration(payload: dict[str, Any]) -> datetime:
    exp = payload.get("exp")
    if isinstance(exp, (int, float)):
        return datetime.fromtimestamp(exp, tz=UTC)
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            return exp.replace(tzinfo=UTC)
        return exp
    return datetime.now(UTC)
