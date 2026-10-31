# Дополнительный образ «всё в одном».
# Для полноценного масштабирования рекомендуется docker compose (db + redis + api + worker + web).
# Debian-based Node image avoids the known npm Exit handler issue in Node 22 + Alpine.
FROM node:22-bookworm-slim AS frontend
WORKDIR /frontend
COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY index.html vite.config.ts tsconfig*.json postcss.config.js tailwind.config.js components.json ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM python:3.12-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DEFAULT_TIMEOUT=100

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.6.0
COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# Предзагрузка модели в образ, чтобы первый запрос не ожидал загрузки весов.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')"

COPY backend/ ./
COPY --from=frontend /frontend/dist /app/static
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
