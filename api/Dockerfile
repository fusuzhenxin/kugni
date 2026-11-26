FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv/api
COPY api/requirements.lock.txt .
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY api/app ./app
COPY api/migrations ./migrations
COPY api/alembic.ini .
COPY shared /srv/shared
RUN useradd --create-home kugni && mkdir -p /srv/storage/uploads && chown -R kugni:kugni /srv
USER kugni
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
