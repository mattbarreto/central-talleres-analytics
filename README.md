# Central de Talleres

Aplicación web para administrar talleres, participantes, equipo, comunicaciones, certificados e insights.

## Stack tecnológico
- Backend: FastAPI, SQLAlchemy, Alembic, JWT
- Frontend: HTML, CSS y JavaScript vanilla (hash routes)
- Base de datos: SQLite (local) y PostgreSQL/Supabase (producción)
- Generación PDF: ReportLab

## Requisitos
- Python 3.12+
- `pip`

## Configuración local
1. Crear entorno virtual:
   - Windows PowerShell: `python -m venv venv`
2. Instalar dependencias:
   - `.\venv\Scripts\python.exe -m pip install -r requirements.txt`
3. Crear variables de entorno:
   - copiar `.env.example` a `.env`
4. Ejecutar migraciones:
   - `.\venv\Scripts\python.exe -m alembic upgrade head`
5. Levantar servidor:
   - `.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000`

## Accesos locales
- App: `http://127.0.0.1:8000/`
- Swagger: `http://127.0.0.1:8000/docs`
- Healthcheck: `http://127.0.0.1:8000/health`

## Docker
- Build + run:
  - `docker compose up --build`

## Estructura principal
- `app/`: backend
- `alembic/`: migraciones
- `frontend/`: UI
- `docs/`: documentación operativa
- `generated/`: artefactos locales (ignorado por git)

