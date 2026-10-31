# ПП 1875 — AI Procurement Copilot

Локальный классификатор наименований товаров по приложениям Постановления Правительства РФ от 23.12.2024 № 1875. Система возвращает позицию приложения, код ОКПД2, национальный режим, квоту для 223-ФЗ, уверенность модели, альтернативы и ссылку на источник.

## Что реализовано

- одиночная классификация и пакеты до 100 товаров;
- семантические эмбеддинги на локальной мультиязычной модели `paraphrase-multilingual-MiniLM-L12-v2`;
- PostgreSQL + pgvector, HNSW-индекс и косинусная близость;
- точное совпадение по коду ОКПД2, если код уже указан в запросе;
- Celery + Redis для фоновой обработки без блокировки интерфейса;
- 893 позиции справочника: приложение № 1 — 151, № 2 — 465, № 3 — 277;
- импорт CSV/TXT и экспорт результатов CSV с UTF-8 BOM для Excel;
- обновление всего справочника через JSON без пересборки и передеплоя;
- журнал классификаций, health/readiness checks, OpenAPI;
- адаптивный React-интерфейс, локальные шрифты, отсутствие внешних API при работе.

> Уверенность — калиброванная оценка семантической близости, а не юридическая вероятность. Итоговую применимость нормы и исключений должен проверять специалист по закупкам.

## Быстрый запуск через Docker

### Требования

- Docker Engine 24+ и Docker Compose v2 (в Docker Desktop они уже входят);
- 4 ГБ свободной оперативной памяти, рекомендуется 6–8 ГБ;
- около 5 ГБ свободного места;
- интернет нужен **только при первой сборке** для загрузки образов, библиотек и модели.

### Установка и запуск

1. Распакуйте архив и откройте терминал в корне проекта (там находится `docker-compose.yml`).
2. Создайте локальную конфигурацию:

   **Linux / macOS:**

   ```bash
   cp .env.example .env
   ```

   **Windows PowerShell:**

   ```powershell
   Copy-Item .env.example .env
   ```

3. Для локального запуска значения можно оставить без изменений. Для сервера замените `POSTGRES_PASSWORD` в `.env` на надёжный пароль.
4. Запустите:

   ```bash
   docker compose up --build
   ```

   Первая сборка может занять 10–20 минут: в backend-образ встраивается ИИ-модель. При последующих запусках она не скачивается заново.

5. Дождитесь сообщений о готовности API и откройте:

   - интерфейс: **http://localhost:8080**;
   - API: **http://localhost:8000/api/v1/ready**;
   - интерактивная OpenAPI-документация: **http://localhost:8000/docs**.

Остановка: `Ctrl+C`, затем `docker compose down`. Запуск в фоне: `docker compose up --build -d`. Просмотр логов: `docker compose logs -f api worker`.

Данные PostgreSQL, Redis и загруженный справочник сохраняются в Docker volumes. Команда `docker compose down -v` удаляет их — используйте её только при необходимости полного сброса.

## Использование

### Один товар

Введите наименование, например «Сервер стоечный 2U» или «Товар с ОКПД2 28.22.14.121». Нажмите «Классифицировать». Раскройте «Альтернативы и метод», чтобы увидеть следующие ближайшие позиции.

### Список товаров

1. Перейдите на вкладку «Список до 100».
2. Вставьте по одному наименованию на строку или импортируйте TXT/CSV. Для CSV используется первый столбец; разделители `;` и Tab поддерживаются. Первая строка `Наименование` распознаётся как заголовок.
3. Нажмите «Обработать список». Запрос отправляется в очередь Celery, страница опрашивает статус задания.
4. Нажмите на строку результата для подробностей или скачайте весь результат в CSV.

### Обновление базы НПА без передеплоя

В разделе «Справочник» нажмите «Загрузить JSON» и выберите файл той же структуры, что `backend/data/catalog.json`. Можно также выполнить:

```bash
curl -X PUT http://localhost:8000/api/v1/catalog \
  -H "Content-Type: application/json" \
  --data-binary @backend/data/catalog.json
```

API валидирует документ, заранее создаёт эмбеддинги и атомарно заменяет данные в одной транзакции. Перезапуск не требуется. При сбое валидации старый справочник сохраняется. Поле `version` должно отражать вашу редакцию данных; `sha256` необязателен.

## Примеры API

### Одиночная классификация

```bash
curl -X POST http://localhost:8000/api/v1/classify \
  -H "Content-Type: application/json" \
  -d '{"query":"Ноутбук портативный","top_k":3}'
```

### Синхронный пакет

```bash
curl -X POST http://localhost:8000/api/v1/classify/batch \
  -H "Content-Type: application/json" \
  -d '{"items":["Кран мостовой","Аппарат ИВЛ","Смартфон"],"top_k":3}'
```

### Асинхронный пакет

```bash
curl -X POST http://localhost:8000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{"items":["Кран мостовой","Аппарат ИВЛ"],"top_k":3}'

# Подставьте job_id из предыдущего ответа:
curl http://localhost:8000/api/v1/jobs/JOB_ID
```

### Справочник и журнал

```bash
curl 'http://localhost:8000/api/v1/catalog?q=монитор&appendix=2&limit=10'
curl http://localhost:8000/api/v1/catalog/status
curl 'http://localhost:8000/api/v1/history?limit=20'
```

## Конфигурация

Все параметры задаются в `.env`; пример находится в `.env.example`.

| Переменная | Назначение | Значение по умолчанию |
|---|---|---|
| `POSTGRES_DB` | Имя базы | `procurement` |
| `POSTGRES_USER` | Пользователь БД | `procurement` |
| `POSTGRES_PASSWORD` | Пароль БД | `change_me_in_production` |
| `MODEL_NAME` | Модель Sentence Transformers | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` |
| `CORS_ORIGINS` | Разрешённые источники через запятую | `http://localhost:8080,http://127.0.0.1:8080` |
| `LOG_LEVEL` | Уровень логов | `INFO` |

`DATABASE_URL`, `REDIS_URL` и `CATALOG_PATH` Compose формирует автоматически. Размерность вектора модели — 384; при смене семейства модели с другой размерностью потребуется миграция схемы и полная переиндексация.

## Проверка качества и скорости

После запуска выполните на хосте с Python 3:

```bash
python3 scripts/benchmark.py
# Windows: py scripts/benchmark.py
```

Скрипт проверяет 20 размеченных товаров, время одиночного ответа и синхронную обработку 100 позиций. Пороги: точность top-1 ≥ 85%, одиночный ответ < 5 секунд, 100 товаров < 120 секунд. Для сохранения отчёта:

```bash
python3 scripts/benchmark.py --output benchmark-report.json
```

Замеры зависят от процессора. Первый запрос после старта может быть медленнее; readiness API включается после загрузки модели и индексации.

## Локальная разработка без Docker

Потребуются Python 3.12, Node.js 22+, PostgreSQL 16 с расширением pgvector и Redis 7.

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
export DATABASE_URL='postgresql+psycopg://procurement:password@localhost:5432/procurement'
export REDIS_URL='redis://localhost:6379/0'
uvicorn app.main:app --reload

# Worker — в отдельном терминале из backend/
celery -A app.tasks.celery_app worker --loglevel=INFO --concurrency=1

# Frontend — в отдельном терминале из корня
npm ci
npm run dev
```

Интерфейс разработки: http://localhost:3000; Vite проксирует `/api` на порт 8000.

### Тесты и проверки

```bash
cd backend
pytest -q
ruff check app tests

cd ..
npm run build
npm run lint
```

## Структура

```text
.
├── backend/
│   ├── app/                 # FastAPI, pgvector, классификатор, Celery
│   ├── data/catalog.json    # Полный локальный справочник
│   ├── data/evaluation.json # 20 приёмочных примеров
│   ├── tests/               # Валидация и целостность данных
│   └── Dockerfile
├── src/                     # React + TypeScript SPA
├── scripts/benchmark.py     # Проверка точности и скорости
├── docker-compose.yml       # db + redis + api + worker + web
├── Dockerfile               # Дополнительный образ «всё в одном»
├── frontend.Dockerfile      # Production-сборка React + Nginx
├── nginx.conf
└── .env.example
```

## Устранение неполадок

- **Порт занят:** освободите 8080/8000 или измените левую часть портов в `docker-compose.yml`, например `"8081:80"`.
- **API долго не готов:** проверьте `docker compose logs api`; первичная векторизация справочника выполняется один раз и сохраняется в PostgreSQL.
- **Пакет остаётся в очереди:** проверьте `docker compose ps` и `docker compose logs worker redis`.
- **Нехватка памяти:** закройте ресурсоёмкие приложения и увеличьте лимит памяти Docker Desktop.
- **Модель не скачивается при сборке:** проверьте доступ к Hugging Face. После успешной сборки контейнеры работают с моделью офлайн.
- **Обновление JSON отклонено:** сверьте обязательные поля и уникальность `id` с `backend/data/catalog.json`; приложение № 3 требует `quota_percent`.

Источник справочника: публикация ПП РФ № 1875 в «Гарант», URL сохранён в каждой позиции. Дата получения встроенного набора — 2026-10-30. Перед реальной закупкой сверяйте действующую редакцию НПА.
