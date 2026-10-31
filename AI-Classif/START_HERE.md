# ПП 1875 — AI Procurement Copilot

# Подробная инструкция: от распаковки до первого запуска

Эта инструкция рассчитана на Windows 10/11, Docker Desktop и PowerShell. Не требуется устанавливать Python, Node.js, PostgreSQL или Redis отдельно: все сервисы запускаются в Docker.

## 1. Подготовьте компьютер

1. Установите Docker Desktop для Windows, если он ещё не установлен.
2. Запустите Docker Desktop и дождитесь состояния **Engine running**.
3. Убедитесь, что в настройках Docker Desktop используется Linux containers (обычный режим Docker Desktop).
4. Рекомендуется иметь не менее 6–8 ГБ свободной оперативной памяти и около 5 ГБ свободного места на диске.
5. Интернет понадобится при первой сборке: Docker скачает базовые образы, Python/Node-зависимости и локальную модель эмбеддингов.

Проверка в PowerShell:

```powershell
docker version
docker compose version
```

Обе команды должны показать версии клиента/сервера Docker и Compose. Если `docker compose` не найден, обновите Docker Desktop. В старых установках вместо него может работать команда `docker-compose` — далее используйте один вариант последовательно.

## 2. Скачайте и распакуйте архив

1. Скачайте ZIP-архив проекта.
2. В Проводнике Windows нажмите на ZIP правой кнопкой мыши → **Извлечь всё…**.
3. Выберите понятную папку, например `C:\Projects` или `F:\Projects`.
4. После распаковки откройте папку проекта `AI-Classificator`.

**Важно:** PowerShell нужно открыть именно в той папке, где виден файл `docker-compose.yml`, а не на уровень выше и не в корне диска.

Ожидаемая структура:

```text
AI-Classificator\
├── backend\
├── public\
├── scripts\
├── src\
├── .env.example
├── docker-compose.yml
├── frontend.Dockerfile
├── Dockerfile
├── package.json
├── package-lock.json
├── nginx.conf
└── README.md
```

Откройте эту папку в Проводнике, щёлкните правой кнопкой мыши по пустому месту и выберите **Открыть в терминале**. Либо откройте PowerShell вручную и выполните `cd` с вашим фактическим путём, например:

```powershell
cd F:\Projects\AI-Classificator
```

Проверьте, что вы находитесь в правильной папке:

```powershell
Get-Location
Test-Path .\docker-compose.yml
Test-Path .\.env.example
```

Обе последние команды должны вывести `True`.

## 3. Создайте свой файл `.env`

`.env` — локальный файл конфигурации. В нём проверяющий указывает собственные параметры и пароль PostgreSQL. Этот файл не нужно отправлять в GitHub или передавать другим людям.

В PowerShell из корня проекта выполните:

```powershell
Copy-Item .env.example .env
notepad .env
```

В Блокноте найдите строки:

```dotenv
POSTGRES_DB=procurement
POSTGRES_USER=procurement
POSTGRES_PASSWORD=CHANGE_THIS_TO_A_UNIQUE_STRONG_PASSWORD
```

Укажите свои значения. Например:

```dotenv
POSTGRES_DB=procurement
POSTGRES_USER=reviewer
POSTGRES_PASSWORD=ВСТАВЬТЕ_СЮДА_СВОЙ_УНИКАЛЬНЫЙ_ПАРОЛЬ
```

Лучше использовать длинный случайный пароль от 24 символов. Чтобы получить 48-символьный hex-пароль средствами Windows PowerShell, можно выполнить отдельный блок ниже и скопировать выведенное значение в `POSTGRES_PASSWORD`:

```powershell
$bytes = New-Object byte[] 24
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$password = -join ($bytes | ForEach-Object { $_.ToString('x2') })
$rng.Dispose()
$password
```

Для `.env` удобно использовать пароль из латинских букв и цифр (hex-строка из команды выше не содержит символов, требующих экранирования). Не добавляйте пробелы вокруг знака `=`.

Остальные переменные в `.env.example` обычно можно оставить без изменений:

```dotenv
DB_HOST=db
DB_PORT=5432
REDIS_URL=redis://redis:6379/0
MODEL_NAME=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
LOG_LEVEL=INFO
MAX_DOCUMENT_UPLOAD_MB=100
MAX_DOCUMENT_PAGES=2000
```

Сохраните файл и закройте Блокнот. Проверьте, что файл действительно называется `.env`, а не `.env.txt`:

```powershell
Get-Item -Force .env
```

Если команда сообщает, что `.env` не найден, включите в Проводнике **Вид → Показать → Расширения имён файлов** и исправьте имя.

## 4. Поймите, когда пароль PostgreSQL задаётся автоматически, а когда его нужно менять отдельно

### Вариант А. Первый запуск на новом компьютере / пустом Docker volume

Никаких SQL-команд выполнять не нужно. При первом запуске PostgreSQL на пустом volume Docker возьмёт `POSTGRES_DB`, `POSTGRES_USER` и `POSTGRES_PASSWORD` из `.env` и создаст базу и пользователя с этими параметрами.

Поэтому для проверяющего на чистой установке порядок такой: распаковать архив → создать и заполнить `.env` → запустить Docker Compose. Скрипт смены пароля не нужен.

### Вариант Б. PostgreSQL уже запускался, а пароль в `.env` изменили позже

PostgreSQL использует уже существующий Docker volume. Переменные `POSTGRES_USER`, `POSTGRES_DB` и `POSTGRES_PASSWORD` из `.env` применяются образом PostgreSQL только при первоначальной инициализации пустого каталога данных. Простое редактирование `.env` не меняет пароль уже существующей роли.

В этом случае:

1. Сначала убедитесь, что `.env` содержит именно тот `POSTGRES_USER`, `POSTGRES_DB` и новый `POSTGRES_PASSWORD`, которые вы хотите использовать.
2. Не удаляйте базу и volume.
3. Из корня проекта запустите скрипт:

```powershell
powershell -ExecutionPolicy Bypass -File .\fix-db-password.ps1
```

Скрипт запускает PostgreSQL/Redis, ждёт готовности базы, выполняет `ALTER ROLE` для заданного пользователя и пересоздаёт API/worker/web. Он не удаляет volume `pgdata`.

Если скрипт сообщает, что команда `docker-compose` не найдена, используйте Docker Desktop с установленной совместимой командой `docker-compose` либо обратитесь к администратору компьютера. Не заменяйте это командой `docker compose down -v`.

Подробности приведены в файле [DB_PASSWORD_FIX.md](DB_PASSWORD_FIX.md).

## 5. Проверьте конфигурацию Compose до сборки

Выполните:

```powershell
docker compose config --quiet
```

Если команда ничего не вывела и вернула приглашение PowerShell, конфигурация разобрана без ошибок. Если Compose сообщает, что не заданы `POSTGRES_USER`, `POSTGRES_DB` или `POSTGRES_PASSWORD`, проверьте, что `.env` лежит рядом с `docker-compose.yml` и заполнен.

Посмотрите итоговые сервисы:

```powershell
docker compose config --services
```

Должны присутствовать `db`, `redis`, `api`, `worker`, `web`.

## 6. Проверьте, не заняты ли порты

Проект публикует следующие локальные порты:

- `8080` — веб-интерфейс;
- `8000` — FastAPI;
- `5432` — PostgreSQL;
- `6379` — Redis.

Если ранее запускали эту сборку с именем проекта `aiclass-reviewer` и старые контейнеры всё ещё работают, остановите именно этот набор контейнеров (команда сохраняет volumes):

```powershell
docker compose -p aiclass-reviewer down
```

Не добавляйте `-v`. Если вы не запускали проект ранее, этот шаг пропустите.

Проверить занятость портов можно командой:

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 8080,8000,5432,6379 } |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

Если порт занят посторонней программой, остановите её или измените левую часть соответствующего `ports` в `docker-compose.yml` (например, `8081:80` для сайта). После изменения порта сайт будет доступен по новому адресу.

## 7. Соберите и запустите все контейнеры

Находясь в каталоге с `docker-compose.yml`, выполните:

```powershell
docker compose up --build -d
```

Что произойдёт:

1. Docker загрузит `pgvector` и `Redis`.
2. Соберёт backend на Python.
3. Загрузит локальную модель `paraphrase-multilingual-MiniLM-L12-v2` в образ backend/worker.
4. Соберёт React-интерфейс и Nginx.
5. Запустит PostgreSQL и Redis.
6. Запустит API и Celery Worker.
7. API создаст таблицы, загрузит модель и подготовит справочник.
8. После успешной проверки API запустится web-контейнер.

Первая сборка может занять 10–20 минут и более — это зависит от скорости интернета и компьютера. Не закрывайте Docker Desktop во время сборки. Последующие запуски обычно быстрее.

Если хотите видеть ход запуска в этом окне, вместо команды с `-d` используйте:

```powershell
docker compose up --build
```

В этом режиме логи будут идти в терминал. Для остановки нажмите `Ctrl+C`. Чтобы затем запустить в фоне, используйте `docker compose up -d`.

## 8. Убедитесь, что все сервисы запущены

Проверьте состояние:

```powershell
docker compose ps -a
```

Ожидаемые сервисы:

| Сервис | Ожидаемый статус |
|---|---|
| `db` | `Up ... (healthy)` |
| `redis` | `Up ... (healthy)` |
| `api` | `Up ... (healthy)` |
| `web` | `Up ... (healthy)` |
| `worker` | `Up` |

У API статус может некоторое время быть `health: starting`, пока инициализируются модель и векторный индекс. Это нормально. Если API перезапускается или долго не становится healthy, посмотрите журналы:

```powershell
docker compose logs --tail=200 api
```

Логи всех важных сервисов:

```powershell
docker compose logs --tail=100 db redis api worker web
```

## 9. Проверьте API и модель

Проверка, что FastAPI отвечает:

```powershell
Invoke-RestMethod http://localhost:8000/api/v1/health
```

Ожидается ответ с `status = ok`.

Проверка полной готовности модели и справочника:

```powershell
Invoke-RestMethod http://localhost:8000/api/v1/ready
```

Ожидается `status = ready` и информация о справочнике. Этот endpoint может возвращать HTTP 503, пока модель ещё загружается; подождите и повторите запрос. Если ошибка сохраняется, изучите `docker compose logs --tail=200 api`.

Интерактивная документация API:

```text
http://localhost:8000/docs
```

## 10. Откройте сайт и сделайте пробную классификацию

Откройте браузер и перейдите по адресу:

```text
http://localhost:8080
```

Введите тестовый товар, например:

```text
Ноутбук портативный
```

Нажмите «Классифицировать». Дождитесь результата. Проверьте, что отображаются позиция приложения, код ОКПД2, национальный режим и оценка уверенности. Нажмите на ссылку позиции/режима и убедитесь, что открывается вкладка «ПП1875 (импортозамещение)» с нужной строкой.

Пробный запрос через PowerShell (после того как `/api/v1/ready` вернул `ready`):

```powershell
$body = @{ query = 'Ноутбук портативный'; top_k = 3 } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:8000/api/v1/classify' `
  -ContentType 'application/json' `
  -Body $body
```

## 11. Остановка, повторный запуск и удаление

Остановить контейнеры, сохранив PostgreSQL и загруженные данные:

```powershell
docker compose down
```

Запустить в фоне позже:

```powershell
docker compose up -d
```

Посмотреть логи:

```powershell
docker compose logs -f api worker
```

**Не используйте `docker compose down -v`, если хотите сохранить базу.** Ключ `-v` удаляет volumes, включая том PostgreSQL `pgdata` и том документов `document_uploads`.

## 12. Частые проблемы

**Compose сообщает, что не задана переменная POSTGRES_PASSWORD.**

- Убедитесь, что `.env` лежит в той же папке, что `docker-compose.yml`.
- Убедитесь, что он называется `.env`, не `.env.txt`.
- Убедитесь, что `POSTGRES_PASSWORD` имеет непустое значение и вы сохранили файл.
- Повторите `docker compose config --quiet`.

**`password authentication failed for user ...`.**

- Если volume уже существовал до смены пароля, выполните `powershell -ExecutionPolicy Bypass -File .\fix-db-password.ps1`.
- Не удаляйте volume ради смены пароля.

**API не становится healthy или сайт показывает 502.**

```powershell
docker compose ps -a
docker compose logs --tail=200 api
docker compose logs --tail=100 web
```

Сначала устраните ошибку API. Nginx/web зависит от готовности API.

**Порт уже используется.**

- Проверьте, не остался ли запущенным старый проект: `docker compose ls`.
- Остановите ненужный стек его project name командой `docker compose -p ИМЯ_ПРОЕКТА down` без `-v`.
- Либо измените опубликованный порт в `docker-compose.yml`.

**Модель долго загружается или не скачивается.**

- На первом запуске backend image загружает модель. Проверьте интернет и свободное место.
- Смотрите `docker compose logs --tail=200 api` и сообщения сборки Docker.
- Не закрывайте Docker Desktop до завершения сборки.

**Проверяющий запускает проект впервые.**

- Нужно заполнить `.env.example` → `.env`.
- На пустом volume PostgreSQL сам создаст пользователя с указанным паролем.
- `fix-db-password.ps1` на чистой установке не нужен.

## 13. Краткая памятка для проверяющего

```powershell
# 1. Перейти в папку, где находится docker-compose.yml
cd F:\Projects\AI-Classificator

# 2. Создать локальный .env из шаблона и заполнить пароль
Copy-Item .env.example .env
notepad .env

# 3. Проверить Compose и запустить
docker compose config --quiet
docker compose up --build -d

# 4. Проверить контейнеры и API
docker compose ps -a
Invoke-RestMethod http://localhost:8000/api/v1/health
Invoke-RestMethod http://localhost:8000/api/v1/ready

# 5. Открыть сайт
# http://localhost:8080
```

Если это **уже существующая** база и пароль в `.env` только что изменили, вместо простого шага запуска сначала выполните:

```powershell
powershell -ExecutionPolicy Bypass -File .\fix-db-password.ps1
```

