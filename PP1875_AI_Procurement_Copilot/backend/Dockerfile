FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/huggingface \
    TOKENIZERS_PARALLELISM=false

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.6.0
COPY requirements.txt .
RUN pip install -r requirements.txt

ARG MODEL_NAME=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
ENV MODEL_NAME=${MODEL_NAME}
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${MODEL_NAME}')"

COPY app ./app
COPY data ./data
RUN useradd --uid 10001 --create-home appuser && chown -R appuser:appuser /app /opt/huggingface
USER appuser
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
