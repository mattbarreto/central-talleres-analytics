from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine_kwargs = {
    "pool_pre_ping": settings.sql_pool_pre_ping,
    "connect_args": connect_args,
}
if not settings.database_url.startswith("sqlite"):
    engine_kwargs.update(
        {
            "pool_size": settings.sql_pool_size,
            "max_overflow": settings.sql_max_overflow,
            "pool_timeout": settings.sql_pool_timeout,
        }
    )

engine = create_engine(settings.database_url, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
