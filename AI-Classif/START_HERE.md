# Быстрый старт — AI Procurement Copilot / ПП № 1875

## Запуск

1. Установите Docker Desktop (или Docker Engine + Compose v2).
2. Скопируйте `.env.example` в `.env` и задайте собственные `POSTGRES_USER`, `POSTGRES_DB` и `POSTGRES_PASSWORD`. Для каждого проверяющего это отдельный локальный файл; не отправляйте `.env` в Git и не включайте его в архив. Пароль может содержать специальные символы — приложение формирует строку подключения безопасно. Если пароль содержит `$`, заключите значение в одинарные кавычки в `.env`, например `POSTGRES_PASSWORD='my$ecure#pass'`.
3. В терминале перейдите в эту папку и выполните:

```bash
docker compose up --build
```

Для фонового запуска используйте `docker compose up --build -d`.
4. Откройте `http://localhost:8080`. API Swagger доступен по адресу `http://localhost:8000/docs`.

Первый Docker build может быть долгим: в backend-образ загружаются PyTorch и модель эмбеддингов. Frontend собирается на `node:22-bookworm-slim` (Debian), а не на Alpine: для Node 22 + Alpine зафиксирована ошибка npm `Exit handler never called` на `npm ci`/`npm install`. В `package-lock.json` используются URL публичного npm registry, а сетевые повторы настроены в `.npmrc`.

После запуска API загружает модель и готовит локальный индекс. Готовность проверяется запросом `http://localhost:8000/api/v1/ready`.

## Если сборка frontend снова падает на `npm ci`

1. Убедитесь, что в `frontend.Dockerfile` указано `FROM node:22-bookworm-slim AS build`, а не `node:22-alpine`.
2. Убедитесь, что файл `.npmrc` находится в корне проекта.
3. Пересоберите только frontend без кэша: `docker compose build --no-cache web`.
4. Затем запустите весь проект: `docker compose up -d`.

PowerShell:

```powershell
docker compose build --no-cache web
docker compose up -d
```

Не удаляйте volume `pgdata` и не используйте `docker compose down -v`, если нужно сохранить загруженный справочник и историю.

## Проверка критериев приёмки

После того как `/api/v1/ready` вернул HTTP 200, запустите из корня проекта:

```bash
python scripts/benchmark.py --output benchmark-report.json
```

В Windows вместо `python` можно использовать `py`. Скрипт проверит точность top-1 на 20 примерах, скорость одиночного запроса и скорость пакетной обработки 100 товаров. Код возврата `0` означает, что все три численных порога пройдены; `1` — что один или несколько порогов не пройдены.

Backend-тесты запускаются так:

```bash
cd backend
pytest -q
```

## Что важно знать

- Обработка PDF/DOCX выполняется в Celery worker через Redis, поэтому HTTP-загрузка не ждёт окончания извлечения текста. Лимиты по умолчанию: 100 МБ и 2 000 страниц.
- PDF должен иметь текстовый слой. OCR для сканированных страниц в этой версии не включён; такие файлы получают понятную ошибку, а не ложный статус «успешно».
- Новый справочник загружается JSON-файлом через вкладку «Справочник» или `PUT /api/v1/catalog`; seed-файл используется только при первоначальном заполнении пустой базы.
- Процент уверенности — эвристическая оценка семантического сходства, а не статистически откалиброванная вероятность или юридическое заключение.
- Приложённый к проекту PDF — пятистраничная обзорная памятка, а не полный официальный текст постановления со всеми таблицами приложений. Локальные строки справочника ведут к позиции в интерфейсе и к странице соответствующего приложения во внешнем правовом источнике.

Подробности, API-примеры и матрица соответствия требованиям находятся в `README.md` и `CASE_AUDIT.md`.


## Если сайт показывает 502 или «API недоступен»

Сначала посмотрите, какой контейнер не запустился (эти команды не удаляют данные):

```powershell
docker-compose ps
docker-compose logs --tail=150 api
docker-compose logs --tail=100 db
docker-compose logs --tail=100 redis
docker-compose logs --tail=100 web
```

Проверьте API напрямую, минуя Nginx:

```powershell
Invoke-WebRequest http://localhost:8000/api/v1/health -UseBasicParsing
Invoke-WebRequest http://localhost:8000/api/v1/ready -UseBasicParsing
Invoke-WebRequest http://localhost:8080/api/v1/health -UseBasicParsing
```

`/api/v1/health` подтверждает, что FastAPI отвечает; `/api/v1/ready` должен вернуть HTTP 200 после загрузки модели и справочника. Если порт 8000 не отвечает или API завершается, пришлите вывод `docker-compose logs --tail=150 api` и `docker-compose ps`. Не выполняйте `docker-compose down -v`: эта команда удаляет том с PostgreSQL.


## Исправление ошибки 502 при старте API

В предыдущей версии в `backend/app/main.py` не был создан объект `logger`, хотя startup-hook использовал `logger.info()` и `logger.exception()`. Из-за `NameError` FastAPI завершался с кодом 3, после чего Nginx показывал 502. В текущей версии объявление `logger = logging.getLogger("app.main")` добавлено до `lifespan`.

После замены файлов выполните из папки проекта:

```powershell
docker-compose up --build
```

Проверьте состояние сервисов в другом окне PowerShell:

```powershell
docker-compose ps
docker-compose logs --tail=100 api
```

Ожидаемые признаки успешного старта API: в логах есть `Startup complete`, контейнер `api` имеет статус `healthy`, а запрос `http://localhost:8000/api/v1/ready` возвращает JSON со статусом `ready`. Интерфейс открывается по адресу `http://localhost:8080`. Не используйте `docker-compose down -v`, если нужно сохранить PostgreSQL volume.

## Обновление интерфейса

Сохранена палитра чёрный / белый / красный и шрифт Times New Roman. Обновлены hero-блок, навигация, панель классификации, карточки результатов, каталог и раздел нормативного документа. Визуальные анимации отключаются при `prefers-reduced-motion`.

## Важно о `.env` и пароле PostgreSQL

Проверяющие самостоятельно создают `.env` из `.env.example` и вводят собственные реквизиты. Docker Compose передаёт одинаковые `POSTGRES_USER`, `POSTGRES_PASSWORD` и `POSTGRES_DB` контейнерам PostgreSQL, API и worker. При первом запуске на пустом Docker volume PostgreSQL создаёт пользователя и базу с этими значениями автоматически. Пароль не зашит в код.

Если проект уже запускался с другим паролем и у PostgreSQL есть существующий volume `pgdata`, изменение `.env` само по себе не меняет пароль существующей роли. Только в таком случае разработчику можно воспользоваться `fix-db-password.ps1` для синхронизации существующей базы без удаления данных. Проверяющим на чистом развёртывании этот скрипт не нужен. Не используйте `docker compose down -v`, если нужно сохранить базу.

Убедись, что в `docker-compose.yml` у сервиса `api` указано `ports: - "8000:8000"`. Затем проверь `docker-compose port api 8000`.
