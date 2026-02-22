from pydantic import BaseModel, EmailStr, Field, field_validator


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("password no puede estar vacio")
        return cleaned


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=4096)

    @field_validator("refresh_token")
    @classmethod
    def validate_refresh_token(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("refresh_token no puede estar vacio")
        return cleaned


class LogoutRequest(BaseModel):
    refresh_token: str | None = Field(default=None, max_length=4096)

    @field_validator("refresh_token")
    @classmethod
    def validate_optional_refresh_token(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        return cleaned
