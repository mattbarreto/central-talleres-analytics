# Desarrollo - Central de Talleres

## Requisitos
- Python 3.12+
- Entorno virtual local (`venv`)

## Setup

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\venv\Scripts\python.exe -m alembic upgrade head
```

## Ejecutar en desarrollo

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

## Variables de entorno
- `DATABASE_URL`
- `SECRET_KEY`
- `ACCESS_TOKEN_EXPIRE_MINUTES` (opcional)

## Notas
- El frontend se sirve desde `frontend/` vía `app/main.py`.
- Para producción usar PostgreSQL (por ejemplo Supabase).

