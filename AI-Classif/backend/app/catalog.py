import hashlib
import json
import logging
from pathlib import Path

from sqlalchemy import func, select, update

from .config import get_settings
from .database import CatalogItem, CatalogMetadata, ClassificationLog, SessionLocal
from .embeddings import embedder
from .schemas import CatalogUpdate

logger = logging.getLogger(__name__)


def load_catalog_file(path: Path | None = None) -> CatalogUpdate:
    source = path or get_settings().catalog_path
    return CatalogUpdate.model_validate_json(source.read_text(encoding="utf-8"))


def replace_catalog(document: CatalogUpdate) -> dict:
    texts = [f"{item.name}. Код ОКПД2: {item.okpd2}" for item in document.items]
    vectors = embedder.encode(texts)
    with SessionLocal() as db:
        with db.begin():
            db.execute(update(ClassificationLog).values(item_id=None))
            db.query(CatalogItem).delete(synchronize_session=False)
            rows = []
            for item, vector in zip(document.items, vectors, strict=True):
                values = item.model_dump()
                values["embedding"] = vector.tolist()
                rows.append(CatalogItem(**values))
            db.add_all(rows)
            metadata = {
                "version": document.version,
                "document": document.document,
                "source_url": document.source_url,
                "retrieved_at": document.retrieved_at,
                "sha256": document.sha256 or hashlib.sha256(document.model_dump_json().encode()).hexdigest(),
            }
            for key, value in metadata.items():
                db.merge(CatalogMetadata(key=key, value=value))
    logger.info("Catalog updated: version=%s, items=%s", document.version, len(rows))
    return {"version": document.version, "items": len(rows)}


def seed_catalog() -> dict:
    """Seed only an empty database; never overwrite a catalog updated through the API."""
    with SessionLocal() as db:
        count = db.scalar(select(func.count()).select_from(CatalogItem)) or 0
        current_version = db.get(CatalogMetadata, "version")

    if count > 0:
        return {
            "version": current_version.value if current_version else "custom",
            "items": count,
            "seeded": False,
            "preserved_existing_catalog": True,
        }

    document = load_catalog_file()
    result = replace_catalog(document)
    return {**result, "seeded": True, "preserved_existing_catalog": False}


def catalog_status() -> dict:
    with SessionLocal() as db:
        count = db.scalar(select(func.count()).select_from(CatalogItem)) or 0
        metadata = {row.key: row.value for row in db.scalars(select(CatalogMetadata)).all()}
    return {
        "items": count,
        "version": metadata.get("version"),
        "document": metadata.get("document"),
        "source_url": metadata.get("source_url"),
        "retrieved_at": metadata.get("retrieved_at"),
        "model": get_settings().model_name,
        "model_ready": embedder.ready,
    }
