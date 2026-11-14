# Prints the laptop's LAN IPv4 addresses (comma-separated) for phone pairing / certificates.
# Skips Hyper-V, WSL, Docker, VirtualBox and VMware adapters, keeps Wi-Fi, Ethernet and the
# Windows Mobile Hotspot ("Wi-Fi Direct Virtual Adapter", usually 192.168.137.1).
$skip = 'Hyper-V|VirtualBox|VMware|Host-Only|TAP-Windows|WSL|Docker|Loopback'
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
    $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*'
} | Where-Object {
    $adapter = Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue
    $adapter -and $adapter.Status -eq 'Up' -and
        ($adapter.InterfaceDescription -notmatch $skip) -and ($_.InterfaceAlias -notmatch 'vEthernet')
} | Sort-Object { if ($_.IPAddress -like '192.168.137.*') { 0 } else { 1 } } | ForEach-Object { $_.IPAddress }
($ips | Select-Object -Unique) -join ','
