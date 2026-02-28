<p align="center">
  <h1 align="center">Central de Talleres</h1>
  <p align="center">
    Plataforma de gestión operativa y analítica de talleres educativos.<br/>
    <em>Operational management and analytics platform for educational workshops.</em>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.12+-3776AB?logo=python&logoColor=white" alt="Python 3.12+" />
  <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" alt="Docker" />
  <a href="https://github.com/mattbarreto/central-talleres-analytics/actions"><img src="https://github.com/mattbarreto/central-talleres-analytics/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

---

## Qué es / What is it

**Central de Talleres** ayuda a organizaciones educativas y culturales a gestionar la operación diaria y la lectura analítica de talleres desde una sola plataforma.

**Central de Talleres** helps educational and cultural organizations manage day-to-day workshop operations and analytics from a single platform.

| Módulo / Module | Español | English |
|---|---|---|
| 🎓 Talleres & Cohortes / Workshops & Cohorts | Crear, programar y seguir el ciclo de vida de cada taller. | Create, schedule, and track each workshop lifecycle. |
| 👥 Participantes / Participants | Gestionar inscripciones, estados (activo/finalizado/baja) y perfiles. | Manage enrollments, statuses (active/finished/dropped), and participant profiles. |
| 📢 Comunicaciones / Communications | Enviar mensajes y mantener historial operativo. | Send messages and keep an operational communication history. |
| 📊 Dashboard & Insights | Monitorear métricas operativas, tendencias y reportes narrativos. | Monitor operational KPIs, trends, and narrative reports. |
| 📜 Certificados / Certificates | Emitir certificados PDF con verificación por código único. | Issue PDF certificates with unique-code verification. |
| 👤 Equipo / Team | Administrar docentes, coordinadores y administradores. | Manage instructors, coordinators, and administrators. |
| 🔒 Seguridad / Security | Auditoría global, hardening de exportaciones y revocación de tokens. | Global audit trail, export hardening, and token revocation. |

---

## Stack tecnológico / Technology stack

| Capa / Layer | Tecnologías / Technologies |
|---|---|
| Backend | FastAPI · SQLAlchemy · Alembic · JWT (python-jose) |
| Frontend | HTML · CSS · JavaScript vanilla · Hash-routing SPA |
| Base de datos / Database | PostgreSQL / Supabase (prod) · SQLite (dev local) |
| Reportes PDF / PDF reports | ReportLab (diseño editorial + data storytelling) |
| Infraestructura / Infrastructure | Docker · Docker Compose · Traefik · GitHub Actions CI |

---

## Inicio rápido / Quick start

### Prerrequisitos / Prerequisites

- Python 3.12+
- pip
- Git
- Node.js 20+ (para frontend) / Node.js 20+ (for frontend)

### Instalación local / Local installation

```powershell
# 1) Clonar repositorio / Clone repository
git clone https://github.com/mattbarreto/central-talleres-analytics.git
cd central-talleres-analytics

# 2) Crear venv e instalar backend / Create venv and install backend dependencies
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt

# 3) Instalar frontend / Install frontend dependencies
cd frontend
npm install
cd ..

# 4) Configurar variables / Configure environment variables
Copy-Item .env.example .env
# Editar .env con tus valores / Edit .env with your values

# 5) Aplicar migraciones / Apply database migrations
.\venv\Scripts\python.exe -m alembic upgrade head

# 6) Crear administrador inicial / Create initial admin user
.\venv\Scripts\python.exe -m scripts.create_admin --email admin@example.com --password Admin123! --first-name Super --last-name Admin --role superadmin

# 7) Levantar API / Start API server
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# (Opcional) Frontend con HMR / (Optional) Frontend with HMR
cd frontend
npm run dev
```

### Docker (desarrollo) / Docker (development)

```bash
docker compose up --build
```

La imagen Docker compila el frontend con Vite y sirve `frontend/dist` en runtime.

The Docker image builds the Vite frontend and serves `frontend/dist` at runtime.

### Compose de producción (portable) / Production compose (portable)

```bash
cp docker-compose.prod.example.yml docker-compose.prod.yml
cp .env.example.prod .env

# Editar .env antes de desplegar / Edit .env before deploying:
# - DATABASE_URL
# - SECRET_KEY
# - APP_DOMAIN
# - PROXY_NETWORK

docker compose -f docker-compose.prod.yml up -d --build --force-recreate
docker compose -f docker-compose.prod.yml exec app alembic upgrade head
```

### Endpoints locales / Local endpoints

| Servicio / Service | URL |
|---|---|
| Aplicación / Application | [`http://localhost:8000`](http://localhost:8000) |
| Swagger UI | [`http://localhost:8000/docs`](http://localhost:8000/docs) |
| ReDoc | [`http://localhost:8000/redoc`](http://localhost:8000/redoc) |
| Healthcheck | [`http://localhost:8000/health`](http://localhost:8000/health) |

### Tests / Testing

```powershell
# Suite completa / Full test suite
python -m pytest tests

# Validación sintáctica backend / Backend syntax validation
python -m compileall app

# Validación sintáctica frontend / Frontend syntax validation
node --check frontend/js/pages/dashboard.js
```

---

## Novedades UI recientes / Recent UI updates

- **Radar operativo en card “Hoy” / “Today” operational radar**: la card prioriza encuentros en curso, luego próximos, excluye finalizados, limita la vista inmediata y deriva el resto a **Ver agenda completa**.
- **Superficies de lectura operativa / Operational reading surfaces**: drawers y paneles de inspección fueron unificados con mejor jerarquía visual, spacing de header y contención consistente.
- **Sidebar colapsada refinada / Refined collapsed sidebar**: mejor legibilidad de navegación, sin barras de desplazamiento en estado colapsado y footer inferior alineado.

---

## Variables de entorno / Environment variables

Copiar `.env.example` y completar los valores requeridos.

Copy `.env.example` and fill in required values.

| Variable | Español | English | Requerida / Required |
|---|---|---|---|
| `DATABASE_URL` | Cadena de conexión (PostgreSQL o SQLite). | Database connection string (PostgreSQL or SQLite). | ✅ |
| `SECRET_KEY` | Clave secreta para firma JWT. | Secret key for JWT signing. | ✅ |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Duración del access token. | Access token lifetime in minutes. | ✅ |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | Duración del refresh token. | Refresh token lifetime in minutes. | ✅ |
| `COOKIE_SECURE` | Restringe cookies a HTTPS (`true`/`false`). | Restricts cookies to HTTPS (`true`/`false`). | ✅ |
| `COOKIE_SAMESITE` | Política SameSite (`Lax`, `Strict`, `None`). | SameSite policy (`Lax`, `Strict`, `None`). | ✅ |
| `CORS_ORIGINS` | Orígenes permitidos (separados por coma). | Allowed origins (comma-separated). | ✅ |
| `REPORT_JOBS_MAX_JOBS` | Máximo de jobs de reportes concurrentes. | Maximum concurrent report jobs. | ✅ |

---

## Estructura del proyecto / Project structure

```text
central-talleres-analytics/
├── app/                  # Backend (API, models, schemas, services, CRUD)
│   ├── api/routes/       # Endpoints REST agrupados por dominio / Domain REST endpoints
│   ├── core/             # Configuración, seguridad y utilidades / Config, security, utilities
│   ├── models/           # Modelos SQLAlchemy / SQLAlchemy models
│   ├── schemas/          # Schemas Pydantic / Pydantic schemas
│   └── services/         # Lógica de negocio / Business logic
├── alembic/              # Migraciones de base de datos / Database migrations
├── frontend/             # SPA vanilla (HTML/CSS/JS)
├── scripts/              # Scripts auxiliares / Helper scripts
├── tests/                # Suite de tests / Automated test suite
├── docs/                 # Documentación operativa y deploy / Ops and deploy docs
├── .github/workflows/    # CI con GitHub Actions / GitHub Actions CI
└── Dockerfile            # Imagen de producción / Production image
```

---

## Base de datos y migraciones / Database and migrations

El esquema se gestiona exclusivamente con **Alembic**. No se usa `create_all()` en runtime.

The schema is managed exclusively with **Alembic**. `create_all()` is not used at runtime.

```powershell
# Aplicar migraciones pendientes / Apply pending migrations
.\venv\Scripts\python.exe -m alembic upgrade head

# Crear nueva migración / Create a new migration
.\venv\Scripts\python.exe -m alembic revision --autogenerate -m "descripcion"
```

---

## Producción / Production

La plataforma está preparada para despliegue con Docker y configuración portable para entornos públicos OSS.

The platform is ready for Docker-based deployment with portable configuration for public OSS environments.

---

## Estado del proyecto / Project status

El proyecto se encuentra en **Release / Stable Beta**. Los módulos core (talleres, participantes, equipo, seguridad y analítica operativa) están robustecidos para operación real.

The project is in **Release / Stable Beta**. Core modules (workshops, participants, team, security, and operational analytics) are hardened for real-world operation.

Como diferencial, incluye un **asistente conversacional 100% client-side** con arquitectura multi-proveedor (Gemini, OpenAI, Anthropic y Ollama) integrado al flujo de comunicaciones.

As a differentiator, it includes a **100% client-side conversational assistant** with a multi-provider architecture (Gemini, OpenAI, Anthropic, and Ollama) integrated into communications workflows.

---

## Autor / Author

**Matías Barreto**

[![Website](https://img.shields.io/badge/Web-matiasbarreto.com-4f46e5?style=flat&logo=google-chrome&logoColor=white)](https://matiasbarreto.com)
[![GitHub](https://img.shields.io/badge/GitHub-mattbarreto-181717?style=flat&logo=github)](https://github.com/mattbarreto)

