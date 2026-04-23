"""POST /api/python/regression — OLS/logit regression.

Implemented with numpy + stdlib math; no scipy/statsmodels/patsy dependency
so the function fits inside Vercel's serverless size limits.
"""

import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from _shared import SIDECAR_VERSION, REQUIREMENTS_HASH, fit_regression  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
            result = fit_regression(
                formula=payload["formula"],
                data=payload["data"],
                family=payload.get("family", "ols"),
            )
            result["sidecarVersion"] = SIDECAR_VERSION
            result["requirementsHash"] = REQUIREMENTS_HASH
            self._respond(200, result)
        except KeyError as e:
            self._respond(400, {"error": f"missing field: {e!s}"})
        except ValueError as e:
            self._respond(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            self._respond(500, {"error": f"internal error: {e!s}"})

    def do_GET(self) -> None:
        self._respond(200, {"ok": True, "endpoint": "regression"})

    def _respond(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
