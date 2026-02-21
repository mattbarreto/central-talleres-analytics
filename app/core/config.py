from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Training Center API"
    api_v1_prefix: str = "/api/v1"

    database_url: str
    sql_pool_pre_ping: bool = True
    report_jobs_ttl_seconds: int = 3600
    report_jobs_max_jobs: int = 300
    secret_key: str
    access_token_expire_minutes: int = 60 * 24


settings = Settings()
