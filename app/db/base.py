from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    def __repr__(self) -> str:
        keys = ("id", "name", "email", "status")
        parts: list[str] = []
        for key in keys:
            if hasattr(self, key):
                parts.append(f"{key}={getattr(self, key)!r}")
        if not parts and hasattr(self, "__mapper__"):
            for column in self.__mapper__.column_attrs[:3]:
                parts.append(f"{column.key}={getattr(self, column.key, None)!r}")
        return f"{self.__class__.__name__}({', '.join(parts)})"
