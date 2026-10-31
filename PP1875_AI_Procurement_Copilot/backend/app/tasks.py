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
    task_time_limit=110,
    task_soft_time_limit=100,
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
