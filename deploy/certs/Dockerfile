# One-shot HTTPS certificate issuer for the demo proxy: the host needs no mkcert / openssl.
FROM alpine:3.20
RUN apk add --no-cache openssl
COPY gen-certs.sh /gen-certs.sh
# Tolerate CRLF checkouts on Windows
RUN sed -i 's/\r$//' /gen-certs.sh
ENTRYPOINT ["sh", "/gen-certs.sh"]
