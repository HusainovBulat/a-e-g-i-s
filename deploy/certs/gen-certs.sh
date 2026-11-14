#!/bin/sh
# Issues the HTTPS certificate for the demo proxy on every start.
#   /ca     (volume aegis-ca)    - local root CA, created once and kept: a phone trusts it only once
#   /certs  (volume aegis-certs) - cert.pem / key.pem for Caddy + rootCA.crt (public, served on :80)
# The certificate covers localhost, the Windows Mobile Hotspot IP and the host LAN IPs from
# AEGIS_PUBLIC_HOSTS, so a new venue network only needs a restart, never a new CA on the phone.
set -eu
mkdir -p /ca /certs

if [ ! -s /ca/ca.key ] || [ ! -s /ca/rootCA.crt ]; then
  echo "Creating the A.E.G.I.S. local certificate authority..."
  openssl req -x509 -new -newkey rsa:2048 -nodes -sha256 -days 3650 \
    -keyout /ca/ca.key -out /ca/rootCA.crt -subj "/O=AEGIS Demo/CN=AEGIS Demo Local CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
fi

SAN="DNS:localhost,IP:127.0.0.1,IP:192.168.137.1"
for h in $(echo "${AEGIS_PUBLIC_HOSTS:-}" | tr ',' ' '); do
  case "$h" in
    127.0.0.1|192.168.137.1) ;;
    *[!0-9.]*) SAN="$SAN,DNS:$h" ;;
    *) SAN="$SAN,IP:$h" ;;
  esac
done

TMP=$(mktemp -d)
printf 'basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=%s\n' "$SAN" > "$TMP/ext"
openssl req -new -newkey rsa:2048 -nodes -keyout "$TMP/key.pem" -out "$TMP/csr" -subj "/O=AEGIS Demo/CN=localhost" 2>/dev/null
# 397 days: the maximum iOS / Safari accept for a server certificate
openssl x509 -req -in "$TMP/csr" -CA /ca/rootCA.crt -CAkey /ca/ca.key -set_serial "0x$(openssl rand -hex 16)" \
  -days 397 -sha256 -extfile "$TMP/ext" -out "$TMP/cert.pem" 2>/dev/null

cp "$TMP/key.pem" "$TMP/cert.pem" /certs/
cp /ca/rootCA.crt /certs/rootCA.crt
chmod 600 /certs/key.pem
chmod 644 /certs/cert.pem /certs/rootCA.crt
rm -rf "$TMP"
echo "HTTPS certificate issued for: $SAN"
