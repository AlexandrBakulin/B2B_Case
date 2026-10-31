import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .config import get_settings

settings = get_settings()
engine = create_engine(settings.sqlalchemy_database_url, pool_pre_ping=True, pool_size=8, max_overflow=8)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class CatalogItem(Base):
    __tablename__ = "catalog_items"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    appendix: Mapped[int] = mapped_column(Integer, index=True)
    position: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(Text)
    okpd2: Mapped[str] = mapped_column(Text, index=True)
    regime: Mapped[str] = mapped_column(String(24), index=True)
    regime_label: Mapped[str] = mapped_column(String(160))
    legal_reference: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(Text)
    quota_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    embedding: Mapped[list[float]] = mapped_column(Vector(settings.embedding_dimension))


class CatalogMetadata(Base):
    __tablename__ = "catalog_metadata"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class ClassificationLog(Base):
    __tablename__ = "classification_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    query: Mapped[str] = mapped_column(Text)
    item_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("catalog_items.id"), nullable=True)
    confidence: Mapped[float] = mapped_column(Float)
    duration_ms: Mapped[float] = mapped_column(Float)
    batch_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


def init_database() -> None:
    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS catalog_embedding_hnsw "
            "ON catalog_items USING hnsw (embedding vector_cosine_ops)"
        ))


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class DocumentJob(Base):
    __tablename__ = "document_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(Text)
    file_type: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(24), default="queued", index=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_count_is_estimate: Mapped[bool] = mapped_column(default=False)
    extracted_chars: Mapped[int] = mapped_column(Integer, default=0)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
