from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "ПП 1875 — классификатор"
    database_url: str = "postgresql+psycopg://procurement:procurement@localhost:5432/procurement"
    redis_url: str = "redis://localhost:6379/0"
    model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    catalog_path: Path = Path(__file__).resolve().parents[1] / "data" / "catalog.json"
    cors_origins: str = "http://localhost:8080,http://127.0.0.1:8080"
    log_level: str = "INFO"
    embedding_dimension: int = 384

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
