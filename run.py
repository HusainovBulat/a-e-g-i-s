"""
Start the Base Server.

    python run.py                       # http://0.0.0.0:8000  (ws://)
    python run.py --https               # https/wss with mkcert files from certs/ (needed for iOS motion events)
    python run.py --port 8443 --cert certs/cert.pem --key certs/key.pem
"""

import argparse
import os

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="A.E.G.I.S. Base Server")
    parser.add_argument("--host", default=os.getenv("AEGIS_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.getenv("AEGIS_PORT", "8000")))
    parser.add_argument("--https", action="store_true", help="serve over TLS (certs/cert.pem + certs/key.pem)")
    parser.add_argument("--cert", default=os.getenv("AEGIS_SSL_CERT", "certs/cert.pem"))
    parser.add_argument("--key", default=os.getenv("AEGIS_SSL_KEY", "certs/key.pem"))
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    ssl = {}
    if args.https:
        ssl = {"ssl_certfile": args.cert, "ssl_keyfile": args.key}
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload, **ssl)


if __name__ == "__main__":
    main()
