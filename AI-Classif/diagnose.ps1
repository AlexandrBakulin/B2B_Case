$ErrorActionPreference = "Continue"

Write-Host "=== Docker Compose containers ===" -ForegroundColor Cyan
docker-compose ps

foreach ($service in @("api", "db", "redis", "worker", "web")) {
    Write-Host "`n=== Logs: $service (last 150 lines) ===" -ForegroundColor Cyan
    docker-compose logs --no-color --tail=150 $service
}

foreach ($url in @(
    "http://localhost:8000/api/v1/health",
    "http://localhost:8000/api/v1/ready",
    "http://localhost:8080/api/v1/health"
)) {
    Write-Host "`n=== Request: $url ===" -ForegroundColor Cyan
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
        Write-Host "HTTP $($response.StatusCode)" -ForegroundColor Green
        Write-Host $response.Content
    } catch {
        Write-Host $_.Exception.Message -ForegroundColor Yellow
    }
}
