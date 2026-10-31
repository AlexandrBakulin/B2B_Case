from functools import lru_cache
from pathlib import Path

from sqlalchemy.engine import URL
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "ПП 1875 — классификатор"
    # Set these values once in .env. SQLAlchemy URL.create safely escapes special
    # characters in passwords, so judges may use strong custom credentials.
    postgres_user: str = "procurement"
    postgres_password: str = "procurement"
    postgres_db: str = "procurement"
    db_host: str = "localhost"
    db_port: int = 5432
    # Optional override for managed PostgreSQL deployments. Docker Compose uses
    # POSTGRES_* and DB_HOST/DB_PORT so all services share exactly one credential set.
    database_url: str | None = None
    redis_url: str = "redis://localhost:6379/0"
    model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    catalog_path: Path = Path(__file__).resolve().parents[1] / "data" / "catalog.json"
    cors_origins: str = "http://localhost:8080,http://127.0.0.1:8080"
    log_level: str = "INFO"
    embedding_dimension: int = 384
    upload_dir: Path = Path(__file__).resolve().parents[1] / "uploads"
    max_document_upload_mb: int = 100
    max_document_pages: int = 2000

    @property
    def sqlalchemy_database_url(self) -> URL | str:
        if self.database_url:
            return self.database_url
        return URL.create(
            drivername="postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.db_host,
            port=self.db_port,
            database=self.postgres_db,
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
