# Fiftythree API: FastAPI + SQLite. The database lives on a mounted persistent volume (/data).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# Non-root runtime user; /data is the mount point for the persistent volume.
RUN useradd --create-home --uid 10001 app \
    && mkdir -p /data \
    && chown app:app /data

COPY --chown=app:app . .
RUN chmod +x docker-entrypoint.sh

USER app

ENV APP_ENV=production \
    DATABASE_URL=sqlite:////data/fiftythree.db \
    SESSION_COOKIE_SECURE=true \
    PORT=8000

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
