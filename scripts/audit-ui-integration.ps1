param(
  [string]$UiRef = 'origin/codex/ui-postgis-integration',
  [string]$WorkRef = 'HEAD',
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Assert-GitRef([string]$Ref) {
  git -C $root rev-parse --verify ($Ref + '^{commit}') 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw ('Git reference not found: {0}' -f $Ref) }
}

function Get-ChangeArea([string]$Path) {
  switch -Regex ($Path) {
    '^riskmap-core-main/src/lib/domain/priority-management/' { return 'CONTRACT' }
    '^riskmap-core-main/src/lib/(maps/SelectedRegionMap|tools/PriorityManagementArea)\.svelte$' { return 'INTEGRATION' }
    '^riskmap-core-main/(package(-lock)?\.json|vite\.config\.js)$' { return 'RUNTIME' }
    '^scripts/(start|stop|status|build|refresh)-' { return 'RUNTIME' }
    '^riskmap-core-main/scripts/' { return 'SERVER_DATA' }
    '^scripts/' { return 'SERVER_DATA' }
    '^supabase/' { return 'SERVER_DATA' }
    '^data/' { return 'SERVER_DATA' }
    '^riskmap-core-main/static/(analysis-data|climate-hazard-layers)/' { return 'SERVER_DATA' }
    '^riskmap-core-main/src/(routes|lib/ui)/' { return 'UI' }
    '^riskmap-core-main/src/' { return 'UI' }
    '^src/' { return 'UI' }
    '^public/' { return 'UI' }
    '^shared/' { return 'CONTRACT' }
    '^docs/' { return 'DOCS' }
    default { return 'OTHER' }
  }
}

Assert-GitRef $UiRef
Assert-GitRef $WorkRef

$mergeBase = (git -C $root merge-base $WorkRef $UiRef).Trim()
if ($LASTEXITCODE -ne 0 -or -not $mergeBase) { throw 'Unable to determine the UI merge base.' }

$workRange = $mergeBase + '..' + $WorkRef
$uiRange = $mergeBase + '..' + $UiRef
$workPaths = @(git -C $root diff --name-only $workRange | Where-Object { $_ })
$uiPaths = @(git -C $root diff --name-only $uiRange | Where-Object { $_ })
$overlapPaths = @($uiPaths | Where-Object { $workPaths -contains $_ })

$rows = @($uiPaths | ForEach-Object {
  [pscustomobject]@{
    Area = Get-ChangeArea $_
    Overlap = $(if ($overlapPaths -contains $_) { 'YES' } else { '' })
    Path = $_
  }
})

$serverDataPaths = @($rows | Where-Object { $_.Area -eq 'SERVER_DATA' })
$manualPaths = @($rows | Where-Object { $_.Area -in @('CONTRACT', 'INTEGRATION', 'RUNTIME') })
$mergeTree = @(git -C $root merge-tree $mergeBase $WorkRef $UiRef 2>$null)
$manualMergeSections = @($mergeTree | Where-Object { $_ -eq 'changed in both' }).Count

Write-Host ''
Write-Host 'Living Labs UI integration audit'
Write-Host ('Work ref : {0}' -f $WorkRef)
Write-Host ('UI ref   : {0}' -f $UiRef)
Write-Host ('Base     : {0}' -f $mergeBase)
Write-Host ''

$rows | Sort-Object Area, Path | Format-Table -AutoSize -Wrap

Write-Host ''
Write-Host ('UI changed paths       : {0}' -f $uiPaths.Count)
Write-Host ('Work/UI overlaps       : {0}' -f $overlapPaths.Count)
Write-Host ('Manual review paths    : {0}' -f $manualPaths.Count)
Write-Host ('Server/data violations : {0}' -f $serverDataPaths.Count)
Write-Host ('Merge review sections  : {0}' -f $manualMergeSections)

if ($serverDataPaths.Count) {
  Write-Warning 'The UI branch contains server or data changes. Move or review these changes separately before integration.'
}
if ($overlapPaths.Count) {
  Write-Warning 'Do not merge the UI branch directly. Integrate the overlapping paths manually and run the full checks.'
}

if ($Strict -and ($serverDataPaths.Count -or $manualMergeSections)) {
  Write-Error 'Strict UI integration audit failed.'
  exit 1
}

Write-Host 'UI integration audit completed.'
