param(
    [string]$CatalogPath = 'D:\90_Data\LivingLabs\sources\NGII_DEM90\catalog_2025.json',
    [string]$DownloadPath = 'C:\Users\User\Downloads',
    [string]$DestinationPath = 'D:\90_Data\LivingLabs\sources\NGII_DEM90\raw\2025',
    [string]$LogPath = 'D:\90_Data\LivingLabs\sources\NGII_DEM90\download.log',
    [int]$BatchSize = 10
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Write-Log([string]$Message) {
    Add-Content -LiteralPath $LogPath -Encoding utf8 -Value ('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Message)
}

function Get-Root {
    $p = Get-Process chrome | Where-Object {
        $_.MainWindowTitle -like '*국토정보플랫폼*' -or $_.MainWindowTitle -like '*신청 파일 다운로드*'
    } | Select-Object -First 1
    if (-not $p) { throw '국토정보플랫폼 Chrome 창을 찾을 수 없습니다.' }
    return [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
}

function Get-All($Root) {
    return $Root.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
    )
}

function Select-Tab($Root, [string]$Prefix, [switch]$Grouped) {
    $all = Get-All $Root
    $target = $null
    for ($i = 0; $i -lt $all.Count; $i++) {
        $e = $all.Item($i)
        if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::TabItem) { continue }
        if ($e.Current.Name -notlike "$Prefix*") { continue }
        if ($Grouped -and $e.Current.Name -notlike '*그룹에 속함*') { continue }
        $target = $e
    }
    if (-not $target) { throw "탭을 찾을 수 없습니다: $Prefix" }
    $target.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
    Start-Sleep -Milliseconds 700
}

function Invoke-Button($Root, [string]$Name, [string]$Class = '') {
    $all = Get-All $Root
    $target = $null
    for ($i = 0; $i -lt $all.Count; $i++) {
        $e = $all.Item($i)
        if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::Button) { continue }
        if ($e.Current.Name -ne $Name) { continue }
        if ($Class -and $e.Current.ClassName -ne $Class) { continue }
        $target = $e
    }
    if (-not $target) { throw "버튼을 찾을 수 없습니다: $Name" }
    $target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
}

function Wait-ForName($Root, [string]$Pattern, [int]$Seconds = 15) {
    $until = (Get-Date).AddSeconds($Seconds)
    do {
        $all = Get-All $Root
        for ($i = 0; $i -lt $all.Count; $i++) {
            if ($all.Item($i).Current.Name -like $Pattern) { return $true }
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $until)
    return $false
}

function Set-MapSelection($Root, [string[]]$Wanted) {
    $all = Get-All $Root
    for ($i = 0; $i -lt $all.Count; $i++) {
        $e = $all.Item($i)
        if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::CheckBox) { continue }
        if ($e.Current.Name -notmatch '^2025 .*?(\d{5})$') { continue }
        $id = $matches[1]
        $toggle = $e.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
        $isOn = $toggle.Current.ToggleState -eq [System.Windows.Automation.ToggleState]::On
        $wantOn = $Wanted -contains $id
        if ($isOn -ne $wantOn) { $toggle.Toggle() }
    }
    Start-Sleep -Milliseconds 700
}

function Fill-And-Submit($Root) {
    $all = Get-All $Root
    $detail = $null
    $agree = $null
    $submit = $null
    for ($i = 0; $i -lt $all.Count; $i++) {
        $e = $all.Item($i)
        if ($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -and $e.Current.Name -eq '상세용도') { $detail = $e }
        if ($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::RadioButton -and $e.Current.Name -eq '동의합니다.') { $agree = $e }
        if ($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $e.Current.Name -eq '다운로드' -and -not $e.Current.ClassName) { $submit = $e }
    }
    if (-not $detail -or -not $agree -or -not $submit) { throw '신청서 필드를 찾을 수 없습니다.' }
    $detail.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue('연구아이디어 시연 및 확인')
    try { $agree.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() }
    catch { $agree.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle() }
    $submit.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
}

New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null
Write-Log 'START 전국 DEM 원본 다운로드 자동화 시작'

try {
    $catalog = (Get-Content -LiteralPath $CatalogPath -Raw | ConvertFrom-Json).tiles
    while ($true) {
        $have = Get-ChildItem -LiteralPath $DestinationPath -File -Filter '*.zip' | ForEach-Object {
            if ($_.Name -match '_(\d{5})_') { $matches[1] }
        }
        $missing = @($catalog | Where-Object { $_ -notin $have })
        if ($missing.Count -eq 0) { Write-Log "COMPLETE 전국 $($catalog.Count)매 다운로드 완료"; break }
        $batch = @($missing | Select-Object -First $BatchSize)
        $root = Get-Root
        Select-Tab $root '국토정보플랫폼 국토정보맵' -Grouped
        $root = Get-Root
        Set-MapSelection $root $batch

        Invoke-Button $root '다운로드' 'download'
        if (-not (Wait-ForName $root '신청서 작성*' 8)) {
            Invoke-Button $root '다운로드' 'download'
            if (-not (Wait-ForName $root '신청서 작성*' 8)) { throw '신청서가 열리지 않았습니다.' }
        }
        Fill-And-Submit $root
        if (-not (Wait-ForName $root '신청 파일 다운로드*' 15)) { throw '신청 파일 다운로드 탭이 열리지 않았습니다. 로그인이 만료됐을 수 있습니다.' }
        Select-Tab $root '신청 파일 다운로드'
        $root = Get-Root
        Invoke-Button $root '전체 다운로드'
        if (-not (Wait-ForName $root '전송시작' 15)) { throw '전송시작 버튼이 나타나지 않았습니다.' }
        Invoke-Button $root '전송시작'

        $deadline = (Get-Date).AddSeconds(30)
        do {
            $downloaded = @($batch | Where-Object {
                Test-Path -LiteralPath (Join-Path $DownloadPath "(B080)공개DEM_${_}_img_2025.zip")
            })
            if ($downloaded.Count -eq $batch.Count) { break }
            Start-Sleep -Seconds 1
        } while ((Get-Date) -lt $deadline)
        if ($downloaded.Count -ne $batch.Count) { throw "파일 전송 제한시간 초과: $($batch -join ',')" }

        foreach ($id in $batch) {
            Copy-Item -LiteralPath (Join-Path $DownloadPath "(B080)공개DEM_${id}_img_2025.zip") -Destination $DestinationPath -Force
        }
        $count = @(Get-ChildItem -LiteralPath $DestinationPath -File -Filter '*.zip').Count
        Write-Log "BATCH 완료: $($batch -join ',') / 누적 $count/$($catalog.Count)"
        Start-Sleep -Seconds 1
    }
}
catch {
    Write-Log "BLOCKED $($_.Exception.Message)"
    exit 1
}
