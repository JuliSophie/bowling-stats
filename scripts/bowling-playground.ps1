[CmdletBinding()]
param([ValidateSet('start','stop')][string]$Action = 'start')

$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Python = Join-Path $Repo 'backend\venv\Scripts\python.exe'
if (-not (Test-Path $Python)) { $Python = Join-Path $Repo '.venv\Scripts\python.exe' }
$Runtime = Join-Path $env:LOCALAPPDATA 'BowlingStatsPlayground'
$Metadata = Join-Path $Runtime 'run.json'
$LockPath = Join-Path $Runtime 'run.lock'
$LogDir = Join-Path $Runtime 'logs'
$BackendPort = 8317
$FrontendPort = 4317

function Get-Descendants([int]$RootPid, $Processes = $null) {
  if ($null -eq $Processes) { $Processes = @(Get-CimInstance Win32_Process) }
  $children = @($Processes | Where-Object ParentProcessId -eq $RootPid)
  foreach ($child in $children) { $child; Get-Descendants $child.ProcessId $Processes }
}
function Get-StartMarker([int]$ProcessId) {
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { return $null }
  return $process.StartTime.ToUniversalTime().ToString('o')
}
function Assert-Owned($root) {
  $process = Get-Process -Id ([int]$root.pid) -ErrorAction SilentlyContinue
  if (-not $process) { return $false }
  if ($process.StartTime.ToUniversalTime().Ticks -ne ([datetime]$root.startTime).ToUniversalTime().Ticks) { return $false }
  return $true
}
function Stop-OwnedRoot($root) {
  if (-not (Assert-Owned $root)) { return }
  $descendants = @(Get-Descendants ([int]$root.pid) | ForEach-Object {
    [pscustomobject]@{pid=$_.ProcessId;startTime=(Get-StartMarker $_.ProcessId)}
  })
  [array]::Reverse($descendants)
  foreach ($child in @($descendants) + @($root)) {
    if ($child.startTime -and (Assert-Owned $child)) {
      try { Stop-Process -Id ([int]$child.pid) -Force }
      catch { if (Assert-Owned $child) { throw } }
    }
  }
}
function Assert-Free([int]$Port) {
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port ist bereits belegt; der Playground startet nicht."
  }
}
function Read-Run {
  if (-not (Test-Path $Metadata)) { return $null }
  return Get-Content $Metadata -Raw | ConvertFrom-Json
}

if ($Action -eq 'stop') {
  $run = Read-Run
  if (-not $run) { Write-Host 'Bowling-Playground ist bereits gestoppt.'; exit 0 }
  foreach ($root in @($run.children)) {
    if ((Get-Process -Id ([int]$root.pid) -ErrorAction SilentlyContinue) -and -not (Assert-Owned $root)) {
      throw "Prozess $($root.pid) gehört nicht mehr zu diesem Playground; nichts wird beendet."
    }
  }
  Remove-Item $Metadata -Force -ErrorAction SilentlyContinue
  foreach ($root in @($run.children)) { Stop-OwnedRoot $root }
  for ($i = 0; $i -lt 15 -and @($run.children | Where-Object { Assert-Owned $_ }).Count; $i++) {
    Start-Sleep -Seconds 1
  }
  if (@($run.children | Where-Object { Assert-Owned $_ }).Count) {
    throw 'Playground-Prozesse konnten nicht vollständig beendet werden.'
  }
  $released = -not (Test-Path $LockPath)
  for ($i = 0; $i -lt 60 -and (Test-Path $LockPath); $i++) {
    $probe = $null
    try {
      $probe = [System.IO.File]::Open($LockPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
      $probe.Dispose()
      $released = $true
      break
    } catch {
      if ($probe) { $probe.Dispose() }
      Start-Sleep -Seconds 1
    }
  }
  if (-not $released -and (Test-Path $LockPath)) { throw 'Der Playground-Startprozess hat seine Sperre noch nicht freigegeben.' }
  Write-Host 'Bowling-Playground gestoppt (nur verifizierte eigene Prozesse).'
  exit 0
}

if (-not (Test-Path $Python)) { throw "Python-Umgebung fehlt: $Python" }
Assert-Free $BackendPort; Assert-Free $FrontendPort
New-Item -ItemType Directory -Force -Path $Runtime,$LogDir | Out-Null
$lockStream = $null
$owned = [System.Collections.Generic.List[object]]::new()
$ownsMetadata = $false
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backendLog = Join-Path $LogDir "$stamp-backend.log"
$backendErrorLog = Join-Path $LogDir "$stamp-backend-error.log"
$frontendLog = Join-Path $LogDir "$stamp-frontend.log"
$frontendErrorLog = Join-Path $LogDir "$stamp-frontend-error.log"
try {
  try {
    # OpenOrCreate recovers an unlocked marker left by a hard supervisor kill.
    $lockStream = [System.IO.File]::Open($LockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  } catch { throw "Ein Playground startet bereits; Stop: $PSCommandPath stop" }
  $existing = Read-Run
  if ($existing) {
    if (@($existing.children | Where-Object { Assert-Owned $_ }).Count) {
      throw "Ein Playground läuft bereits. Stop: $PSCommandPath stop"
    }
    Remove-Item $Metadata -Force
  }
  $runtimeValue = $Runtime
  $backendCommand = "`$env:BOWLING_PLAYGROUND='1'; `$env:BOWLING_PLAYGROUND_RUNTIME='$runtimeValue'; `$env:PYTHONPATH='$(Join-Path $Repo 'backend')'; & '$Python' -m uvicorn app.playground:app --host 127.0.0.1 --port $BackendPort --lifespan on"
  $backend = Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory (Join-Path $Repo 'backend') -ArgumentList '-NoProfile','-Command',$backendCommand -RedirectStandardOutput $backendLog -RedirectStandardError $backendErrorLog -PassThru
  $owned.Add([pscustomobject]@{pid=$backend.Id;startTime=(Get-StartMarker $backend.Id)})
  $frontendDir = Join-Path $Repo 'frontend'
  $frontendCommand = "`$env:NEXT_PUBLIC_API_BASE='http://127.0.0.1:$BackendPort/api'; Set-Location '$frontendDir'; & npm.cmd run dev -- --hostname 127.0.0.1 --port $FrontendPort"
  $frontend = Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory $frontendDir -ArgumentList '-NoProfile','-Command',$frontendCommand -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErrorLog -PassThru
  $owned.Add([pscustomobject]@{pid=$frontend.Id;startTime=(Get-StartMarker $frontend.Id)})
  $run = [pscustomobject]@{children=$owned;backendPort=$BackendPort;frontendPort=$FrontendPort}
  $tmp = "$Metadata.tmp"
  $run | ConvertTo-Json | Set-Content -Encoding UTF8 $tmp
  Move-Item $tmp $Metadata -Force
  $ownsMetadata = $true

  for ($i=0; $i -lt 180; $i++) {
    foreach ($root in $owned) { if (-not (Assert-Owned $root)) { throw "Ein Child wurde beendet; Logs: $LogDir" } }
    try {
      $health = Invoke-RestMethod "http://127.0.0.1:$BackendPort/health" -TimeoutSec 1
      if ($health.playground -eq 'bowling-stats-local') {
        $live = Invoke-WebRequest "http://127.0.0.1:$FrontendPort/live" -TimeoutSec 2 -UseBasicParsing
        if ($live.StatusCode -eq 200) { break }
      }
    } catch {}
    if ($i -eq 179) { throw "Frontend wurde innerhalb von 180 Sekunden nicht bereit; Logs: $frontendLog" }
    Start-Sleep -Seconds 1
  }
  Write-Host "Playground bereit: http://127.0.0.1:$FrontendPort/live"
  Write-Host "Debug-Client: http://127.0.0.1:$BackendPort/debug"
  Write-Host "Stoppen: $PSCommandPath stop"
  while ($true) {
    Start-Sleep 1
    foreach ($root in $owned) {
      if (-not (Assert-Owned $root)) {
        if (-not (Test-Path $Metadata)) { return }
        throw "Ein Child wurde beendet; Logs: $LogDir"
      }
    }
  }
} finally {
  foreach ($root in $owned) { Stop-OwnedRoot $root }
  if ($lockStream) {
    if ($ownsMetadata) { Remove-Item $Metadata -Force -ErrorAction SilentlyContinue }
    Remove-Item "$Metadata.tmp" -Force -ErrorAction SilentlyContinue
    $lockStream.Dispose()
  }
}
