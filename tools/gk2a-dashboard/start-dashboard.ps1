$ErrorActionPreference = 'Stop'
$dashboardUrl = 'http://127.0.0.1:4187'
try { $response = Invoke-RestMethod "$dashboardUrl/api/status" -TimeoutSec 3; if ($response.jobs) { Start-Process $dashboardUrl; exit 0 } } catch {}
$nodePath = (Get-Command node.exe).Source
Start-Process -FilePath $nodePath -ArgumentList ('"' + (Join-Path $PSScriptRoot 'server.mjs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server-error.log')
Start-Sleep -Seconds 4
Start-Process $dashboardUrl
