<#
.SYNOPSIS
Ensures OmniRoute is running on port 20128. If not, launches it silently in the background.
#>
param(
    [switch]$OpenBrowser = $false
)

$port = 20128
$url = "http://localhost:$port"

$isUp = $false
try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($r -and $r.StatusCode -eq 200) {
        $isUp = $true
    }
} catch {
    $isUp = $false
}

if (-not $isUp) {
    Write-Host "[OmniRoute] Server is not active. Starting background daemon..." -ForegroundColor Cyan
    
    $nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $nodePath) {
        $nodePath = "C:\Program Files\nodejs\node.exe"
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $nodePath
    $psi.Arguments = "--max-old-space-size=8192 scripts/dev/run-next.mjs dev"
    $psi.WorkingDirectory = "D:\OmniRoute"
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.CreateNoWindow = $true
    $psi.UseShellExecute = $false
    
    [System.Diagnostics.Process]::Start($psi) | Out-Null

    $maxWait = 35
    $elapsed = 0
    while ($elapsed -lt $maxWait) {
        Start-Sleep -Seconds 1
        $elapsed++
        try {
            $check = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
            if ($check -and $check.StatusCode -eq 200) {
                Write-Host "[OmniRoute] Server is ready on $url (started in ${elapsed}s)" -ForegroundColor Green
                $isUp = $true
                break
            }
        } catch {}
    }

    if (-not $isUp) {
        Write-Warning "[OmniRoute] Warning: Server start is taking longer than expected. Proceeding..."
    }
}

if ($OpenBrowser) {
    Start-Process "$url/dashboard"
}
