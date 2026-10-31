# Дополнительный образ «всё в одном» для площадок без Docker Compose.
# Основной рекомендуемый запуск: docker compose up --build (см. README.md).
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY package*.json ./
RUN npm ci || npm install
COPY index.html vite.config.ts tsconfig*.json postcss.config.js tailwind.config.js components.json ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/huggingface TOKENIZERS_PARALLELISM=false \
    HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
WORKDIR /app
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.6.0
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
ARG MODEL_NAME=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
ENV MODEL_NAME=${MODEL_NAME}
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${MODEL_NAME}')"
COPY backend/app ./app
COPY backend/data ./data
COPY --from=frontend /frontend/dist ./static
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
