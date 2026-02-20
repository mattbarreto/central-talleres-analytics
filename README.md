# Central de Talleres | Training Workshops Hub

Aplicación web para gestión operativa y analítica de talleres, participantes, equipo, comunicaciones y certificados.  
Web app for operational management and analytics of workshops, participants, staff, communications, and certificates.

---

## 🇪🇸 Español

### Descripción
**Central de Talleres** es una plataforma para organizaciones educativas/culturales que necesitan:
- gestionar talleres y cohortes,
- administrar participantes e inscripciones,
- coordinar docentes/coordinación,
- enviar comunicaciones,
- emitir certificados PDF,
- analizar métricas e insights en dashboard.

### Funcionalidades principales
- Autenticación de administradores con JWT.
- Gestión CRUD de talleres, participantes, equipo y administradores.
- Gestión de inscripciones por taller y estado.
- Comunicaciones con historial de envíos.
- Dashboard e Insights con vistas de resumen y avanzada.
- Emisión de certificados y verificación por código.
- Exportación de datos y reportes.

### Stack tecnológico
- **Backend:** FastAPI, SQLAlchemy, Alembic, JWT
- **Frontend:** HTML, CSS y JavaScript vanilla (hash routing)
- **Base de datos:** PostgreSQL/Supabase (producción), SQLite (local legacy)
- **PDF:** ReportLab
- **DevOps:** Docker, GitHub Actions (CI)

### Requisitos
- Python 3.12+
- pip

### Configuración local (Windows PowerShell)
```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m scripts.create_admin --email admin@example.com --password admin123
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

### Accesos
- App: `http://127.0.0.1:8000/`
- Swagger: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- Healthcheck: `http://127.0.0.1:8000/health`

### Variables de entorno
Ver `.env.example`.

Campos mínimos:
- `DATABASE_URL`
- `SECRET_KEY`
- `ACCESS_TOKEN_EXPIRE_MINUTES`

### Base de datos y migraciones
- Esquema gestionado por **Alembic**.
- No usar `create_all` en runtime para producción.
- Guía Supabase: `docs/SUPABASE_SETUP.md`

### Docker
```bash
docker compose up --build
```

### Estructura del proyecto
```text
app/         Backend (API, modelos, schemas, CRUD)
alembic/     Migraciones
frontend/    UI (vanilla JS/CSS/HTML)
docs/        Documentación operativa y deploy
scripts/     Scripts auxiliares (ej. bootstrap de admin)
```

### Estado del proyecto
En desarrollo activo, con foco en:
- consistencia UI/UX del dashboard,
- escalabilidad de datos,
- hardening para producción.

---

## 🇬🇧 English

### Overview
**Training Workshops Hub** is a web platform for educational/cultural organizations that need to:
- manage workshops and cohorts,
- handle participants and enrollments,
- coordinate staff (teachers/coordinators),
- send communications,
- issue PDF certificates,
- monitor metrics and insights through dashboards.

### Key features
- Admin authentication using JWT.
- Full CRUD for workshops, participants, team, and admins.
- Enrollment management by workshop and status.
- Communications with delivery history.
- Dashboard and Insights with summary/advanced modes.
- Certificate issuance and verification by code.
- Data export and reporting workflows.

### Tech stack
- **Backend:** FastAPI, SQLAlchemy, Alembic, JWT
- **Frontend:** Vanilla HTML/CSS/JavaScript (hash routes)
- **Database:** PostgreSQL/Supabase (production), SQLite (legacy local)
- **PDF:** ReportLab
- **DevOps:** Docker, GitHub Actions (CI)

### Requirements
- Python 3.12+
- pip

### Local setup (Windows PowerShell)
```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m scripts.create_admin --email admin@example.com --password admin123
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

### Local endpoints
- App: `http://127.0.0.1:8000/`
- Swagger: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- Healthcheck: `http://127.0.0.1:8000/health`

### Environment variables
See `.env.example`.

Required keys:
- `DATABASE_URL`
- `SECRET_KEY`
- `ACCESS_TOKEN_EXPIRE_MINUTES`

### Database and migrations
- Schema is managed with **Alembic**.
- Avoid runtime schema creation in production.
- Supabase guide: `docs/SUPABASE_SETUP.md`

### Docker
```bash
docker compose up --build
```

### Project structure
```text
app/         Backend (API, models, schemas, CRUD)
alembic/     Migrations
frontend/    UI (vanilla JS/CSS/HTML)
docs/        Operational and deployment docs
scripts/     Utility scripts (e.g. admin bootstrap)
```

### Project status
Actively developed, currently focused on:
- dashboard UI/UX consistency,
- data scalability,
- production hardening.

---

## Documentación adicional | Additional docs
- `docs/USO.md`
- `docs/DESARROLLO.md`
- `docs/DEPLOY_PRODUCCION.md`
- `docs/SUPABASE_SETUP.md`

## Autor | Author
**Matías Barreto**  
Website: https://matiasbarreto.com  
Repository: https://github.com/mattbarreto/central-talleres-analytics

