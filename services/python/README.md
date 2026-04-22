# Python sidecar

FastAPI service that handles the tool's traditional text-analytic methods (dictionary word-counting) and the regression
harness (statsmodels). Runs alongside the Next.js app — deployed separately to Fly.io so the Python environment,
scikit-learn / statsmodels versions, and spaCy model (M2+) can be pinned and recorded in every run's reproducibility
manifest.

## Local dev

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
pip install -r requirements.txt
pip install pytest httpx
pytest
```

## Deploy (Fly.io)

```bash
fly launch --no-deploy
fly secrets set PYTHON_SIDECAR_SHARED_SECRET=<generate-a-long-random-string>
fly deploy --build-arg IMAGE_DIGEST=$(git rev-parse HEAD)
```

## API surface

- `GET /health` — version + image digest for run manifests.
- `POST /dictionary/score` — body: `{ method, documents, dictionary? }`.
- `POST /regression/fit` — body: `{ formula, data, family }` (statsmodels formula syntax).

All POST endpoints require the `x-sidecar-secret` header when `PYTHON_SIDECAR_SHARED_SECRET` is set.
