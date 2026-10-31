import asyncio
import logging
import uuid
from datetime import datetime
from contextlib import asynccontextmanager
from pathlib import Path

from celery.result import AsyncResult
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

from .catalog import catalog_status, replace_catalog, seed_catalog
from .classifier import classify_batch, classify_one
from .config import get_settings
from .database import CatalogItem, ClassificationLog, DocumentJob, SessionLocal, get_db, init_database
from .embeddings import embedder
from .schemas import (
    BatchRequest, BatchResponse, CatalogUpdate, ClassifyRequest,
    ClassificationResult, HistoryItem, JobResponse,
)
from .tasks import celery_app, process_document_task

settings = get_settings()
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Log each startup phase explicitly: otherwise a slow model load can look like
    # a dead API behind Nginx and is difficult to diagnose from Docker logs.
    try:
        logger.info("Startup 1/3: initializing PostgreSQL schema and pgvector")
        await asyncio.to_thread(init_database)
        logger.info("Startup 2/3: loading embedding model %s", settings.model_name)
        await asyncio.to_thread(embedder.load)
        logger.info("Startup 3/3: checking/seeding catalog")
        catalog_info = await asyncio.to_thread(seed_catalog)
        logger.info(
            "Startup complete: model_ready=%s, catalog_items=%s, seeded=%s",
            embedder.ready,
            catalog_info.get("items"),
            catalog_info.get("seeded", False),
        )
    except Exception:
        logger.exception("API startup failed; inspect the error above")
        raise
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Локальный семантический классификатор товаров по приложениям ПП РФ № 1875",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health", tags=["system"])
def health():
    return {"status": "ok", "service": "api"}


@app.get("/api/v1/ready", tags=["system"])
def ready():
    catalog = catalog_status()
    if not embedder.ready or not catalog["items"]:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Модель или справочник ещё загружаются")
    return {"status": "ready", **catalog}


@app.post("/api/v1/classify", response_model=ClassificationResult, tags=["classification"])
async def classify(request: ClassifyRequest):
    try:
        return await asyncio.to_thread(classify_one, request.query, request.top_k)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc


@app.post("/api/v1/classify/batch", response_model=BatchResponse, tags=["classification"])
async def batch(request: BatchRequest):
    results, duration = await asyncio.to_thread(classify_batch, request.items, request.top_k)
    return BatchResponse(results=results, count=len(results), duration_ms=duration)


@app.post("/api/v1/jobs", response_model=JobResponse, status_code=202, tags=["classification"])
async def create_job(request: BatchRequest):
    task = celery_app.send_task("procurement.classify_batch", args=[request.items, request.top_k])
    return JobResponse(job_id=task.id, status="queued")


@app.get("/api/v1/jobs/{job_id}", tags=["classification"])
def job_status(job_id: str):
    task = AsyncResult(job_id, app=celery_app)
    state = task.state.lower()
    response = {"job_id": job_id, "status": state}
    if task.successful():
        response["result"] = task.result
    elif task.failed():
        response["error"] = "Не удалось обработать пакет. Проверьте логи worker."
    return response


@app.post("/api/v1/documents", status_code=status.HTTP_202_ACCEPTED, tags=["documents"])
async def upload_document(file: UploadFile = File(...)):
    """Accept PDF/DOCX quickly and delegate extraction to Celery/Redis."""
    original_name = Path(file.filename or "document").name[:255]
    extension = Path(original_name).suffix.lower().lstrip(".")
    if extension not in {"pdf", "docx"}:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Поддерживаются только PDF и DOCX.")

    max_bytes = settings.max_document_upload_mb * 1024 * 1024
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    document_id = str(uuid.uuid4())
    destination = settings.upload_dir / f"{document_id}.{extension}"
    total = 0
    signature = b""

    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        f"Файл превышает лимит {settings.max_document_upload_mb} МБ.",
                    )
                if len(signature) < 8:
                    signature += chunk[: 8 - len(signature)]
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    if total == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Загружен пустой файл.")
    if extension == "pdf" and not signature.startswith(b"%PDF-"):
        destination.unlink(missing_ok=True)
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Файл не похож на PDF-документ.")
    if extension == "docx" and not signature.startswith(b"PK"):
        destination.unlink(missing_ok=True)
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Файл не похож на DOCX-документ.")

    with SessionLocal() as db:
        db.add(DocumentJob(
            id=document_id, filename=original_name, stored_path=str(destination),
            file_type=extension, status="queued",
        ))
        db.commit()

    try:
        task = process_document_task.delay(document_id, str(destination), extension)
    except Exception as exc:
        with SessionLocal() as db:
            job = db.get(DocumentJob, document_id)
            if job is not None:
                job.status = "failed"
                job.error = "Не удалось отправить документ в очередь. Проверьте Redis и worker."
                job.completed_at = datetime.utcnow()
                db.commit()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Очередь обработки временно недоступна.") from exc

    return {"document_id": document_id, "task_id": task.id, "status": "queued", "filename": original_name}


@app.get("/api/v1/documents/{document_id}", tags=["documents"])
def document_status(document_id: str):
    with SessionLocal() as db:
        job = db.get(DocumentJob, document_id)
        if job is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Документ не найден.")
        return {
            "document_id": job.id,
            "filename": job.filename,
            "file_type": job.file_type,
            "status": job.status,
            "page_count": job.page_count,
            "page_count_is_estimate": job.page_count_is_estimate,
            "extracted_chars": job.extracted_chars,
            "preview": (job.extracted_text or "")[:5000],
            "error": job.error,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "download_text_url": f"/api/v1/documents/{job.id}/text" if job.status == "completed" else None,
        }


@app.get("/api/v1/documents/{document_id}/text", tags=["documents"], response_class=PlainTextResponse)
def document_text(document_id: str):
    with SessionLocal() as db:
        job = db.get(DocumentJob, document_id)
        if job is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Документ не найден.")
        if job.status != "completed" or job.extracted_text is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Текст документа ещё не готов.")
        return PlainTextResponse(
            job.extracted_text,
            headers={"Content-Disposition": f'attachment; filename="document-{job.id}.txt"'},
        )


@app.get("/api/v1/catalog", tags=["catalog"])
def catalog(
    q: str = Query(default="", max_length=200),
    appendix: int | None = Query(default=None, ge=1, le=3),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = select(CatalogItem).order_by(CatalogItem.appendix, CatalogItem.position)
    if q:
        query = query.where(CatalogItem.name.ilike(f"%{q}%") | CatalogItem.okpd2.ilike(f"%{q}%"))
    if appendix:
        query = query.where(CatalogItem.appendix == appendix)
    items = db.scalars(query.offset(offset).limit(limit)).all()
    return {"items": [{
        "id": item.id, "name": item.name, "okpd2": item.okpd2,
        "appendix": item.appendix, "position": item.position,
        "regime": item.regime, "regime_label": item.regime_label,
        "legal_reference": item.legal_reference, "source_url": item.source_url,
        "quota_percent": item.quota_percent,
    } for item in items], "limit": limit, "offset": offset}


@app.get("/api/v1/catalog/status", tags=["catalog"])
def get_catalog_status():
    return catalog_status()


@app.put("/api/v1/catalog", tags=["catalog"])
async def update_catalog(document: CatalogUpdate):
    """Атомарно заменяет справочник и векторы без перезапуска контейнеров."""
    return await asyncio.to_thread(replace_catalog, document)


@app.get("/api/v1/history", response_model=list[HistoryItem], tags=["history"])
def history(limit: int = Query(default=20, ge=1, le=100), db: Session = Depends(get_db)):
    rows = db.scalars(select(ClassificationLog).order_by(ClassificationLog.created_at.desc()).limit(limit)).all()
    return [HistoryItem(
        id=row.id, query=row.query, item_id=row.item_id, confidence=row.confidence,
        duration_ms=row.duration_ms, created_at=row.created_at.isoformat(),
    ) for row in rows]


# Все-в-одном Docker-образе FastAPI также раздаёт production-сборку React.
_static_dir = Path("/app/static")
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="frontend")
