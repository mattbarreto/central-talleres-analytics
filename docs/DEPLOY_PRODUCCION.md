# Deploy a Producción

## Opción 1: Docker
1. Configurar `.env` con PostgreSQL/Supabase real.
2. Ejecutar:
   - `docker compose up --build -d`
3. Verificar:
   - `http://<host>:8000/health`

## Opción 2: Proceso Python directo
1. Instalar dependencias:
   - `python -m pip install -r requirements.txt`
2. Migrar:
   - `python -m alembic upgrade head`
3. Correr API:
   - `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`

## Recomendaciones
- Ejecutar detrás de reverse proxy (Nginx/Caddy).
- Configurar TLS.
- Rotar `SECRET_KEY`.
- No usar SQLite en producción.
- Habilitar backups de PostgreSQL.

