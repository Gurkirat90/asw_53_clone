from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

# EmailStr is intentionally not used: email-validator rejects the reserved .test domain of the
# demo user (demo@example.test).
EmailField = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=254)]
PasswordField = Annotated[str, StringConstraints(min_length=1, max_length=1024)]


class LoginRequest(BaseModel):
    email: EmailField
    password: PasswordField

    @field_validator("password")
    @classmethod
    def _password_not_blank(cls, value: str) -> str:
        # Whitespace-only passwords are treated as empty; the value itself is never stripped.
        if not value.strip():
            raise ValueError("This field is required.")
        return value


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    display_name: str
