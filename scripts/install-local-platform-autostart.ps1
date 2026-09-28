param([string]$TaskName = 'LivingLabs Local Recovery', [switch]$AtLogonOnly)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'platform-runtime.ps1')
New-Item -ItemType Directory -Path $PlatformRuntime -Force | Out-Null
$node = (Get-Command node.exe -ErrorAction Stop).Source
$runner = Join-Path $PSScriptRoot 'watch-platform.ps1'
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing -and ($existing.Actions.Arguments -join ' ') -notlike "*$runner*") {
  throw 'Task name is already owned by another action.'
}
if ($existing) {
  Export-ScheduledTask -TaskName $TaskName | Set-Content `
    (Join-Path $PlatformRuntime ("local-task-backup-{0}.xml" -f (Get-Date -Format yyyyMMdd-HHmmss)))
}
[pscustomobject]@{node=$node; root=$PlatformRoot; installedAt=(Get-Date).ToString('o')} |
  ConvertTo-Json | Set-Content (Join-Path $PlatformRuntime 'platform-autostart.json') -Encoding UTF8
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`"" -WorkingDirectory $PlatformRoot
$triggers = @(
  New-ScheduledTaskTrigger -AtLogOn -User $identity
)
if (-not $AtLogonOnly) { $triggers += New-ScheduledTaskTrigger -AtStartup }
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 4)
# Same user, limited token, no stored password. No remote Windows authentication or EFS dependency.
$logonType = if ($AtLogonOnly) { 'Interactive' } else { 'S4U' }
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType $logonType -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings `
  -Principal $principal -Description 'Local platform startup at logon/boot only. No periodic checks; daily audit is managed separately.' -Force -ErrorAction Stop | Out-Null
Remove-Item -LiteralPath $PlatformPause -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
Write-Output "Installed and started: $TaskName"
