param([switch]$Production)
$ErrorActionPreference = 'Stop'
$platformRoot = Split-Path $PSScriptRoot -Parent
$runtimeDirectory = Join-Path $platformRoot '.runtime'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$pythonExecutable = Join-Path $platformRoot 'api/.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $pythonExecutable)) { throw 'Run the installation commands in README.md first.' }
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
Push-Location (Join-Path $platformRoot 'api')
try {
    & $pythonExecutable -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
    & $pythonExecutable -m app.seed
    if ($LASTEXITCODE -ne 0) { throw 'Database seeding failed.' }
} finally { Pop-Location }
$existingState = @{}
$stateFile = Join-Path $runtimeDirectory 'processes.json'
if (Test-Path $stateFile) { $existingState = Get-Content $stateFile -Raw | ConvertFrom-Json -AsHashtable }
function Start-KugniService($serviceName, $command, $commandArguments, $serviceDirectory, $port) {
    if ($port -and (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) {
        Write-Host "$serviceName port $port is already listening; existing process preserved."
        return
    }
    if (!$port -and $existingState.ContainsKey($serviceName)) {
        $oldProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($existingState[$serviceName])" -ErrorAction SilentlyContinue
        if ($oldProcess -and $oldProcess.CommandLine -like '*app.worker*') { return }
    }
    $started = Start-Process -FilePath $command -ArgumentList $commandArguments -WorkingDirectory $serviceDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory "$serviceName.log") -RedirectStandardError (Join-Path $runtimeDirectory "$serviceName.error.log")
    $existingState[$serviceName] = $started.Id
}
Start-KugniService 'api' $pythonExecutable '-m uvicorn app.main:app --host 127.0.0.1 --port 8000' (Join-Path $platformRoot 'api') 8000
$nextEntry = Join-Path $platformRoot 'web/node_modules/next/dist/bin/next'
$webArguments = if ($Production) { '"' + (Join-Path $PSScriptRoot 'start-web.cjs') + '"' } else { '"' + $nextEntry + '" dev --hostname 127.0.0.1 --port 3001' }
Start-KugniService 'web' $nodeExecutable $webArguments (Join-Path $platformRoot 'web') 3001
Start-KugniService 'worker' $pythonExecutable '-m app.worker' (Join-Path $platformRoot 'api') 0
$existingState | ConvertTo-Json | Set-Content -LiteralPath $stateFile
$startupDeadline = [DateTime]::UtcNow.AddSeconds(30)
$webReady = $false
while ([DateTime]::UtcNow -lt $startupDeadline) {
    try {
        $webReady = (Invoke-WebRequest -Uri 'http://127.0.0.1:3001/' -Method Head -TimeoutSec 2 -ErrorAction Stop).StatusCode -eq 200
        if ($webReady) { break }
    } catch { }
    Start-Sleep -Milliseconds 250
}
if (!$webReady) { throw 'Web startup did not become ready within 30 seconds. Check .runtime/web.error.log.' }
Write-Host 'Frontend: http://127.0.0.1:3001/'
Write-Host 'Admin: http://127.0.0.1:3001/admin/dashboard/'
Write-Host 'Publisher: http://127.0.0.1:3001/publisher/dashboard/'
Write-Host 'Credentials: LOCAL-ACCESS.md; logs: .runtime/'
