"""POST /api/python/dictionary — dictionary scoring.

Vercel Python runtime. The sibling `_shared.py` module (underscore prefix)
is not deployed as an endpoint but is importable from this handler.
"""

import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from _shared import score_documents  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
            result = score_documents(
                method=payload.get("method", "lmd"),
                documents=payload.get("documents", []),
                user_dictionary=payload.get("dictionary"),
            )
            self._respond(200, result)
        except ValueError as e:
            self._respond(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            self._respond(500, {"error": f"internal error: {e!s}"})

    def do_GET(self) -> None:
        self._respond(200, {"ok": True, "endpoint": "dictionary"})

    def _respond(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
