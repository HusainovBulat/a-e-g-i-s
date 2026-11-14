# Lets phones on the same network reach the demo through Windows Firewall:
# inbound TCP 80, 443, 3000, 8000, from the local subnet only, on any network profile
# (venue Wi-Fi is often classified as "Public"). Created once; asks for admin rights (UAC) once.
# Exit code: 0 = rule present, 1 = not created (UAC declined / no rights).
param([switch]$Elevated)
$name = 'A.E.G.I.S. demo'
if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) { exit 0 }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    if ($Elevated) { exit 1 }
    Write-Host 'Allowing phones through Windows Firewall - confirm the Windows prompt (one time only)...'
    try {
        $p = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Elevated')
        exit $p.ExitCode
    } catch { exit 1 }
}

try {
    New-NetFirewallRule -DisplayName $name -Description 'A.E.G.I.S. demo: phone sensor page, console and API' `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80, 443, 3000, 8000 `
        -RemoteAddress LocalSubnet -Profile Any -ErrorAction Stop | Out-Null
    exit 0
} catch { exit 1 }
