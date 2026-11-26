$ErrorActionPreference = 'Stop'
$platformRoot = Split-Path $PSScriptRoot -Parent
$stateFile = Join-Path $platformRoot '.runtime/processes.json'
if (!(Test-Path $stateFile)) { Write-Host 'No managed local processes.'; return }
$services = Get-Content $stateFile -Raw | ConvertFrom-Json -AsHashtable
foreach ($entry in $services.GetEnumerator()) {
    $serviceProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.Value)" -ErrorAction SilentlyContinue
    if (!$serviceProcess) { continue }
    $expectedCommand = if ($entry.Key -eq 'worker') { '*app.worker*' } elseif ($entry.Key -eq 'api') { '*uvicorn app.main:app*' } else { '*kugni-platform*' }
    if ($serviceProcess.CommandLine -like $expectedCommand) { Stop-Process -Id $serviceProcess.ProcessId -ErrorAction SilentlyContinue; Write-Host "Stopped $($entry.Key)." }
}
Remove-Item -LiteralPath $stateFile
