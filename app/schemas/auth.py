from pydantic import BaseModel, EmailStr, Field, field_validator


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


class LoginResponse(BaseModel):
    """Returned on successful login, refresh, and /me.
    Tokens are NOT exposed — they live in HttpOnly cookies only.
    """
    email: str
