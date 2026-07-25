param(
    [string]$BaseUrl = "http://localhost:8088"
)

$ErrorActionPreference = "Stop"

$frontendStatus = & curl.exe --silent --show-error --output NUL --write-out "%{http_code}" "$BaseUrl/"
if ($LASTEXITCODE -ne 0 -or $frontendStatus -ne "200") {
    throw "Frontend smoke test failed: HTTP $frontendStatus"
}

$healthPayload = & curl.exe --fail --silent --show-error "$BaseUrl/api/v1/health/"
if ($LASTEXITCODE -ne 0) {
    throw "Health endpoint request failed"
}

$health = $healthPayload | ConvertFrom-Json
if ($health.status -ne "ok" -or $health.database -ne "postgresql") {
    throw "Unexpected health response: $healthPayload"
}

Write-Output "Frontend: HTTP 200"
Write-Output "API: ok (PostgreSQL)"
