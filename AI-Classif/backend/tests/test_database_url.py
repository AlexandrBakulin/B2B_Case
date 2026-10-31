from sqlalchemy.engine import URL

from app.config import Settings


def test_database_url_uses_postgres_env_values(monkeypatch):
    monkeypatch.setenv("POSTGRES_USER", "review_user")
    monkeypatch.setenv("POSTGRES_PASSWORD", "p@ss:#/word")
    monkeypatch.setenv("POSTGRES_DB", "review_db")
    monkeypatch.setenv("DB_HOST", "db")
    monkeypatch.setenv("DB_PORT", "5432")

    settings = Settings(_env_file=None)
    url = settings.sqlalchemy_database_url

    assert isinstance(url, URL)
    assert url.drivername == "postgresql+psycopg"
    assert url.username == "review_user"
    assert url.password == "p@ss:#/word"
    assert url.host == "db"
    assert url.port == 5432
    assert url.database == "review_db"


def test_database_url_override_is_supported():
    custom = "postgresql+psycopg://custom:secret@db.example:5432/customdb"
    settings = Settings(_env_file=None, database_url=custom)
    assert settings.sqlalchemy_database_url == custom
