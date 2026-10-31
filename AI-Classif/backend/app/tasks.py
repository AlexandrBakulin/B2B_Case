from celery import Celery

from .config import get_settings

settings = get_settings()
celery_app = Celery(
    "procurement",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_track_started=True,
    # Long-running PDF/DOCX extraction must not be killed by the old 100s limit.
    task_time_limit=1800,
    task_soft_time_limit=1740,
    result_expires=3600,
    worker_prefetch_multiplier=1,
)


@celery_app.task(name="procurement.classify_batch")
def classify_batch_task(items: list[str], top_k: int = 3) -> dict:
    from .classifier import classify_batch

    results, duration = classify_batch(items, top_k)
    return {
        "results": [result.model_dump() for result in results],
        "count": len(results),
        "duration_ms": duration,
    }


@celery_app.task(name="procurement.process_document", max_retries=0)
def process_document_task(document_id: str, file_path: str, file_type: str) -> dict:
    from datetime import datetime

    from .database import DocumentJob, SessionLocal
    from .document_parser import extract_document

    with SessionLocal() as db:
        job = db.get(DocumentJob, document_id)
        if job is None:
            raise RuntimeError("Задание обработки документа не найдено")
        job.status = "processing"
        job.error = None
        db.commit()

    try:
        page_count, is_estimate, extracted_text = extract_document(file_path, file_type)
        with SessionLocal() as db:
            job = db.get(DocumentJob, document_id)
            if job is None:
                raise RuntimeError("Задание обработки документа не найдено")
            job.status = "completed"
            job.page_count = page_count
            job.page_count_is_estimate = is_estimate
            job.extracted_chars = len(extracted_text)
            job.extracted_text = extracted_text
            job.completed_at = datetime.utcnow()
            db.commit()
        return {"document_id": document_id, "status": "completed", "pages": page_count, "characters": len(extracted_text)}
    except Exception as exc:
        with SessionLocal() as db:
            job = db.get(DocumentJob, document_id)
            if job is not None:
                job.status = "failed"
                job.error = str(exc)[:1000]
                job.completed_at = datetime.utcnow()
                db.commit()
        raise
