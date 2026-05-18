from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Accounting Web App"
    database_url: str = "sqlite:///./accounting.db"
    openai_api_key: str | None = None
    allowed_origins: str = "http://localhost:3000"
    sample_data_dir: str = "D:/AccountingApp"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
