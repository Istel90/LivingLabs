$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$rows = foreach ($name in @('GK2A NDVI Daily Downloader', 'GK2A Raw NDVI Inputs Downloader')) {
  $task = Get-ScheduledTask -TaskName $name
  $info = $task | Get-ScheduledTaskInfo
  [pscustomobject]@{ name=$name; state=$task.State.ToString(); lastRun=$info.LastRunTime.ToString('o'); nextRun=$info.NextRunTime.ToString('o'); result=$info.LastTaskResult }
}
ConvertTo-Json -InputObject @($rows) -Compress
