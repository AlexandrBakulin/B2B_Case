$ErrorActionPreference = 'Stop'

# Run from the project root. This script updates the existing PostgreSQL role
# password to match POSTGRES_PASSWORD in .env. It does NOT delete/recreate volumes.

if (-not (Test-Path -LiteralPath '.env')) {
    throw 'Файл .env не найден. Создай его из .env.example и заполни POSTGRES_PASSWORD.'
}

$values = @{}
foreach ($line in Get-Content -LiteralPath '.env') {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
        $key = $Matches[1]
        $value = $Matches[2].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        } else {
            $value = ($value -replace '\s+#.*$', '').Trim()
        }
        $values[$key] = $value
    }
}

function Get-EnvValue([string]$Name, [string]$DefaultValue) {
    $processValue = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($processValue)) { return $processValue }
    if ($values.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace($values[$Name])) {
        return [string]$values[$Name]
    }
    return $DefaultValue
}

$dbUser = Get-EnvValue 'POSTGRES_USER' 'procurement'
$dbName = Get-EnvValue 'POSTGRES_DB' 'procurement'
$dbPassword = Get-EnvValue 'POSTGRES_PASSWORD' ''
if ([string]::IsNullOrWhiteSpace($dbPassword)) {
    throw 'POSTGRES_PASSWORD пустой или не указан в .env.'
}
if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    throw 'Команда docker-compose не найдена. Установи Docker Desktop или используй docker compose.'
}

Write-Host '1/4 Запускаю PostgreSQL и Redis (тома не удаляются)...' -ForegroundColor Cyan
docker-compose up -d db redis
if ($LASTEXITCODE -ne 0) { throw 'Не удалось запустить db/redis.' }

Write-Host '2/4 Ожидаю готовность PostgreSQL...' -ForegroundColor Cyan
$dbContainer = (docker-compose ps -q db | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($dbContainer)) { throw 'Контейнер db не найден.' }
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
    $health = (docker inspect --format '{{.State.Health.Status}}' $dbContainer 2>$null | Out-String).Trim()
    if ($health -eq 'healthy') { $healthy = $true; break }
    if ($health -eq 'unhealthy') { throw 'PostgreSQL сообщил статус unhealthy. Проверь: docker-compose logs --tail=100 db' }
    Start-Sleep -Seconds 2
}
if (-not $healthy) { throw 'PostgreSQL не стал healthy за 120 секунд. Проверь логи db.' }

Write-Host '3/4 Синхронизирую пароль роли с .env без удаления базы...' -ForegroundColor Cyan
$quotedRole = '"' + $dbUser.Replace('"', '""') + '"'
$quotedPassword = "'" + $dbPassword.Replace("'", "''") + "'"
$sql = "ALTER ROLE $quotedRole WITH PASSWORD $quotedPassword;"
$sql | docker-compose exec -T db psql -X -v ON_ERROR_STOP=1 -U $dbUser -d $dbName
if ($LASTEXITCODE -ne 0) {
    throw 'Не удалось обновить пароль PostgreSQL. База и тома не удалялись. Проверь имя пользователя/БД в .env и локальную авторизацию контейнера db.'
}

Write-Host '4/4 Пересоздаю только API, worker и frontend...' -ForegroundColor Cyan
docker-compose up -d --force-recreate api worker web
if ($LASTEXITCODE -ne 0) { throw 'Не удалось перезапустить api/worker/web.' }

Write-Host ''
Write-Host 'Пароль PostgreSQL синхронизирован. Данные в pgdata сохранены.' -ForegroundColor Green
$publishedApiPort = docker-compose port api 8000 2>$null
if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($publishedApiPort | Out-String).Trim())) {
    Write-Host ("API-порт опубликован: {0}" -f (($publishedApiPort | Out-String).Trim())) -ForegroundColor Green
} else {
    Write-Warning 'Compose не показывает публикацию порта API. Проверь, что заменён docker-compose.yml из этого комплекта.'
}
Write-Host 'Проверь запуск API: docker-compose logs --tail=100 api'
Write-Host 'Когда API станет ready: Invoke-RestMethod http://localhost:8000/api/v1/ready'
