from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Training Center API"
    api_v1_prefix: str = "/api/v1"

    database_url: str
    sql_pool_pre_ping: bool = True
    sql_pool_size: int = 5
    sql_max_overflow: int = 10
    sql_pool_timeout: int = 30
    cors_origins: str = "http://localhost:8000,http://127.0.0.1:8000"
    report_jobs_ttl_seconds: int = 3600
    report_jobs_max_jobs: int = 300
    secret_key: str
    access_token_expire_minutes: int = 60
    refresh_token_expire_minutes: int = 60 * 24 * 14
    auth_rate_limit_window_seconds: int = 300
    auth_rate_limit_max_attempts: int = 7
    email_delivery_mode: str = "demo"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = True
    smtp_sender_email: str | None = None
    certificates_retention_days: int = 60
    insights_cache_path: str = "generated/cache/insights_cache.json"
    insights_cache_max_entries: int = 128
    revoked_access_tokens_path: str = "generated/cache/revoked_access_tokens.json"
    revoked_refresh_tokens_path: str = "generated/cache/revoked_refresh_tokens.json"
    log_level: str = "INFO"
    log_json: bool = True

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [item.strip() for item in self.cors_origins.split(",")]
        return [item for item in origins if item]


settings = Settings()
