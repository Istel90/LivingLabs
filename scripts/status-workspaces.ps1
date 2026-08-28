$ErrorActionPreference = "Stop"

$workRoot = Split-Path -Parent $PSScriptRoot
$workspaceParent = Split-Path -Parent $workRoot

$lanes = @(
    [pscustomobject]@{
        Role = "작업본"
        Path = $workRoot
        ExpectedBranch = "work/main"
    },
    [pscustomobject]@{
        Role = "공개본"
        Path = Join-Path $workspaceParent "LivingLabs_PUBLIC"
        ExpectedBranch = "master"
    },
    [pscustomobject]@{
        Role = "UI 작업본"
        Path = Join-Path $workspaceParent "LivingLabs_UI"
        ExpectedBranch = "codex/ui-postgis-integration"
    }
)

function Invoke-GitText {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryPath,
        [Parameter(Mandatory = $true)][string[]]$GitArgs
    )

    $result = & git -C $RepositoryPath @GitArgs 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }
    return (($result | Out-String).Trim())
}

$rows = foreach ($lane in $lanes) {
    if (-not (Test-Path -LiteralPath $lane.Path)) {
        [pscustomobject]@{
            Role = $lane.Role
            Folder = $lane.Path
            Branch = "MISSING"
            Expected = $lane.ExpectedBranch
            Commit = "-"
            Changes = "-"
            State = "MISSING"
        }
        continue
    }

    $branch = Invoke-GitText -RepositoryPath $lane.Path -GitArgs @("branch", "--show-current")
    $commit = Invoke-GitText -RepositoryPath $lane.Path -GitArgs @("rev-parse", "--short", "HEAD")
    $status = Invoke-GitText -RepositoryPath $lane.Path -GitArgs @("status", "--porcelain")
    $changeCount = if ([string]::IsNullOrWhiteSpace($status)) { 0 } else { @($status -split "`r?`n").Count }

    [pscustomobject]@{
        Role = $lane.Role
        Folder = $lane.Path
        Branch = $branch
        Expected = $lane.ExpectedBranch
        Commit = $commit
        Changes = $changeCount
        State = if ($branch -eq $lane.ExpectedBranch) { "OK" } else { "MISMATCH" }
    }
}

$rows | Format-Table Role, Branch, Expected, Commit, Changes, State, Folder -AutoSize

$publicUrl = "https://istel90.github.io/LivingLabs/tools/"
try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $publicUrl -TimeoutSec 15
    Write-Host ""
    Write-Host "공개 사이트: OK $([int]$response.StatusCode) $publicUrl"
} catch {
    Write-Warning "공개 사이트 확인 실패: $publicUrl"
}

$invalidRows = @($rows | Where-Object { $_.State -ne "OK" })
if ($invalidRows.Count -gt 0) {
    throw "작업폴더 역할이 올바르지 않습니다. MISSING 또는 MISMATCH 항목을 확인하세요."
}

