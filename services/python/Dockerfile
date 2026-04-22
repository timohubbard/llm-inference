# Pinned digest — update via `docker pull python:3.12-slim && docker inspect ... | jq '.[0].Id'`
FROM python:3.12-slim@sha256:1af27f5a4d67a3f8de88a8e1d53fd11d4f7e91b04bbe23b67b2fa27e9f2e8db2

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Baked in at image-build time so every run manifest records the build that produced it.
ARG IMAGE_DIGEST=unknown
ENV SIDECAR_IMAGE_DIGEST=${IMAGE_DIGEST}
ENV SIDECAR_VERSION=0.1.0

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
