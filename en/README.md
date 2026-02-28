<p align="right">
  <a href="../README.md"><img src="https://img.shields.io/badge/Idioma-Espa%C3%B1ol-0b7285?style=for-the-badge" alt="Leer en Español" /></a>
  <a href="./README.md"><img src="https://img.shields.io/badge/Language-English-1f6feb?style=for-the-badge" alt="Read in English" /></a>
</p>

<p align="center">
  <h1 align="center">Central de Talleres</h1>
  <p align="center">
    Operational management and analytics platform for educational workshops.
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

## What is it

**Central de Talleres** helps educational and cultural organizations manage daily workshop operations and analytics from a single platform.

| Module | Description |
|---|---|
| 🎓 Workshops and Cohorts | Create, schedule, and track each workshop lifecycle. |
| 👥 Participants | Manage enrollments, statuses (active/finished/dropped), and participant profiles. |
| 📢 Communications | Send messages and keep operational communication history. |
| 📊 Dashboard and Insights | Monitor operational KPIs, trends, and narrative reports. |
| 📜 Certificates | Issue PDF certificates with unique-code verification. |
| 👤 Team | Manage instructors, coordinators, and administrators. |
| 🔒 Security | Global audit trail, export hardening, and token revocation. |

---

## Technology stack

| Layer | Technologies |
|---|---|
| Backend | FastAPI · SQLAlchemy · Alembic · JWT (python-jose) |
| Frontend | HTML · CSS · Vanilla JavaScript · Hash-routing SPA |
| Database | PostgreSQL / Supabase (prod) · SQLite (local dev) |
| PDF reports | ReportLab (editorial layout + data storytelling) |
| Infrastructure | Docker · Docker Compose · Traefik · GitHub Actions CI |

---

## Quick start

### Prerequisites

- Python 3.12+
- pip
- Git
- Node.js 20+ (frontend)

### Local installation

```powershell
# 1) Clone repository
git clone https://github.com/mattbarreto/central-talleres-analytics.git
cd central-talleres-analytics

# 2) Create virtual environment and install backend
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt

# 3) Install frontend
cd frontend
npm install
cd ..

# 4) Configure environment variables
Copy-Item .env.example .env
# Edit .env with your values

# 5) Apply migrations
.\venv\Scripts\python.exe -m alembic upgrade head

# 6) Create initial admin
.\venv\Scripts\python.exe -m scripts.create_admin --email admin@example.com --password Admin123! --first-name Super --last-name Admin --role superadmin

# 7) Start API
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# (Optional) Frontend with HMR
cd frontend
npm run dev
```

### Docker (development)

```bash
docker compose up --build
```

The Docker image builds the frontend with Vite and serves `frontend/dist` at runtime.

### Production compose (portable)

```bash
cp docker-compose.prod.example.yml docker-compose.prod.yml
cp .env.example.prod .env

# Edit .env before deploying:
# - DATABASE_URL
# - SECRET_KEY
# - APP_DOMAIN
# - PROXY_NETWORK

docker compose -f docker-compose.prod.yml up -d --build --force-recreate
docker compose -f docker-compose.prod.yml exec app alembic upgrade head
```

### Local endpoints

| Service | URL |
|---|---|
| Application | [`http://localhost:8000`](http://localhost:8000) |
| Swagger UI | [`http://localhost:8000/docs`](http://localhost:8000/docs) |
| ReDoc | [`http://localhost:8000/redoc`](http://localhost:8000/redoc) |
| Healthcheck | [`http://localhost:8000/health`](http://localhost:8000/health) |

### Tests

```powershell
# Full suite
python -m pytest tests

# Backend syntax validation
python -m compileall app

# Frontend syntax validation
node --check frontend/js/pages/dashboard.js
```

---

## Recent UI updates

- **"Today" operational radar card**: prioritizes live sessions, then upcoming ones, excludes completed items, limits immediate view, and routes remaining items to **View full agenda**.
- **Operational reading surfaces**: drawers and inspection panels were unified with stronger hierarchy, improved header spacing, and consistent containment.
- **Refined collapsed sidebar**: clearer navigation, no scrollbars in collapsed state, and aligned lower footer actions.

---

## Environment variables

Copy `.env.example` and fill required values.

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | Connection string (PostgreSQL or SQLite). | ✅ |
| `SECRET_KEY` | Secret key used to sign JWT tokens. | ✅ |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime. | ✅ |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | Refresh token lifetime. | ✅ |
| `COOKIE_SECURE` | Restrict cookies to HTTPS (`true`/`false`). | ✅ |
| `COOKIE_SAMESITE` | SameSite policy (`Lax`, `Strict`, `None`). | ✅ |
| `CORS_ORIGINS` | Allowed origins (comma-separated). | ✅ |
| `REPORT_JOBS_MAX_JOBS` | Maximum concurrent report jobs. | ✅ |

---

## Project structure

```text
central-talleres-analytics/
├── app/                  # Backend (API, models, schemas, services, CRUD)
│   ├── api/routes/       # Domain REST endpoints
│   ├── core/             # Config, security, and utilities
│   ├── models/           # SQLAlchemy models
│   ├── schemas/          # Pydantic schemas
│   └── services/         # Business logic
├── alembic/              # Database migrations
├── frontend/             # Vanilla SPA (HTML/CSS/JS)
├── scripts/              # Helper scripts
├── tests/                # Automated test suite
├── docs/                 # Operational and deployment docs
├── .github/workflows/    # GitHub Actions CI
└── Dockerfile            # Production image
```

---

## Database and migrations

Schema changes are managed only through **Alembic**. `create_all()` is not used at runtime.

```powershell
# Apply pending migrations
.\venv\Scripts\python.exe -m alembic upgrade head

# Create a new migration
.\venv\Scripts\python.exe -m alembic revision --autogenerate -m "description"
```

---

## Production

The platform is ready for Docker-based deployment with portable configuration for public OSS environments.

---

## Project status

The project is currently in **Release / Stable Beta**. Core modules (workshops, participants, team, security, and operational analytics) are hardened for real-world usage.

As a differentiator, it includes a **100% client-side conversational assistant** with a multi-provider architecture (Gemini, OpenAI, Anthropic, and Ollama) integrated into communications workflows.

---

## Author

**Matías Barreto**

[![Website](https://img.shields.io/badge/Web-matiasbarreto.com-4f46e5?style=flat&logo=google-chrome&logoColor=white)](https://matiasbarreto.com)
[![GitHub](https://img.shields.io/badge/GitHub-mattbarreto-181717?style=flat&logo=github)](https://github.com/mattbarreto)
