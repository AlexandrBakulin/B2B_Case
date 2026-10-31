import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from celery.result import AsyncResult
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

from .catalog import catalog_status, replace_catalog, seed_catalog
from .classifier import classify_batch, classify_one
from .config import get_settings
from .database import CatalogItem, ClassificationLog, get_db, init_database
from .embeddings import embedder
from .schemas import (
    BatchRequest, BatchResponse, CatalogUpdate, ClassifyRequest,
    ClassificationResult, HistoryItem, JobResponse,
)
from .tasks import celery_app

settings = get_settings()
logging.basicConfig(level=settings.log_level)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await asyncio.to_thread(init_database)
    await asyncio.to_thread(embedder.load)
    await asyncio.to_thread(seed_catalog)
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
