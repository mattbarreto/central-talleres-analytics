<p align="center">
  <h1 align="center">Central de Talleres</h1>
  <p align="center">
    Plataforma de gestión operativa y analítica de talleres educativos.<br/>
    <em>Operational management & analytics platform for training workshops.</em>
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

**Central de Talleres** permite a organizaciones educativas y culturales gestionar de forma integral:

| Módulo | Descripción |
|---|---|
| 🎓 **Talleres & Cohortes** | Crear, programar y dar seguimiento al ciclo de vida de cada taller. |
| 👥 **Participantes** | Inscripciones, estados (activo / finalizado / baja) y perfiles. |
| 📢 **Comunicaciones** | Envío y registro histórico de mensajes a participantes. |
| 📊 **Dashboard & Insights** | Métricas en tiempo real, gráficos de tendencia y reportes PDF narrativos. |
| 📜 **Certificados** | Emisión de certificados PDF con verificación por código único. |
| 👤 **Equipo** | Gestión de docentes, coordinadores y administradores. |
| 🔒 **Seguridad** | Auditoría global, hardening de exportaciones y revocación de tokens. |

---

## Stack tecnológico

| Capa | Tecnologías |
|---|---|
| **Backend** | FastAPI · SQLAlchemy · Alembic · JWT (python-jose) |
| **Frontend** | HTML · CSS · JavaScript vanilla · Hash routing SPA |
| **Base de datos** | PostgreSQL / Supabase (prod) · SQLite (dev local) |
| **Reportes PDF** | ReportLab (diseño editorial con data storytelling) |
| **Infra** | Docker · Docker Compose · Traefik · GitHub Actions CI |

---

## Inicio rápido

### Prerrequisitos

- Python 3.12+
- pip
- Git

### Instalación

```powershell
# 1. Clonar el repositorio
git clone https://github.com/mattbarreto/central-talleres-analytics.git
cd central-talleres-analytics

# 2. Crear entorno virtual e instalar dependencias
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt

# 3. Configurar variables de entorno
Copy-Item .env.example .env
# Editar .env con tus valores (DATABASE_URL, SECRET_KEY, etc.)

# 4. Aplicar migraciones
.\venv\Scripts\python.exe -m alembic upgrade head

# 5. Crear usuario administrador
.\venv\Scripts\python.exe -m scripts.create_admin --email admin@example.com --password Admin123!

# 6. Iniciar servidor de desarrollo
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

### Con Docker

```bash
docker compose up --build
```

### Endpoints locales

| Servicio | URL |
|---|---|
| Aplicación | [`http://localhost:8000`](http://localhost:8000) |
| Swagger UI | [`http://localhost:8000/docs`](http://localhost:8000/docs) |
| ReDoc | [`http://localhost:8000/redoc`](http://localhost:8000/redoc) |
| Healthcheck | [`http://localhost:8000/health`](http://localhost:8000/health) |

### Tests

```powershell
# Ejecutar suite completa de tests automatizados
.\venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
```

---

## Variables de entorno

Copiar `.env.example` y completar los valores requeridos:

| Variable | Descripción | Requerida |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión (PostgreSQL o SQLite) | ✅ |
| `SECRET_KEY` | Clave secreta para JWT | ✅ |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Duración del access token | ✅ |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | Duración del refresh token | ✅ |
| `CORS_ORIGINS` | Orígenes permitidos (separados por coma) | ✅ |
| `REPORT_JOBS_MAX_JOBS` | Máximo de jobs concurrentes | ✅ |

---

## Estructura del proyecto

```text
central-talleres-analytics/
├── app/                  # Backend (API, modelos, schemas, servicios, CRUD)
│   ├── api/routes/       # Endpoints REST agrupados por dominio
│   ├── core/             # Configuración, seguridad, utilidades PDF
│   ├── models/           # Modelos SQLAlchemy
│   ├── schemas/          # Schemas Pydantic
│   └── services/         # Lógica de negocio y generación de reportes
├── alembic/              # Migraciones de base de datos
├── frontend/             # SPA vanilla (HTML/CSS/JS)
├── scripts/              # Scripts auxiliares (bootstrap admin, etc.)
├── tests/                # Suite de tests automatizados
├── docs/                 # Documentación operativa y de deploy
├── .github/workflows/    # CI con GitHub Actions
└── Dockerfile            # Imagen de producción
```

---

## Base de datos y migraciones

El esquema se gestiona exclusivamente con **Alembic**. No se usa `create_all()` en runtime.

```powershell
# Aplicar todas las migraciones pendientes
.\venv\Scripts\python.exe -m alembic upgrade head

# Crear una nueva migración
.\venv\Scripts\python.exe -m alembic revision --autogenerate -m "descripción"
```

---

## Producción

La plataforma está diseñada para ser desplegada mediante **Docker**. El stack incluye un proxy reverso (Traefik) y soporte para bases de datos PostgreSQL gestionadas (como Supabase).

---

## Estado del proyecto

En **desarrollo activo**, con foco actual en:

- ✅ Reportes PDF con diseño editorial y data storytelling
- ✅ Hardening de seguridad y auditoría global
- 🔄 Consistencia UI/UX y modularización del frontend
- 🔄 Optimización de escalabilidad de datos

---

## Autor

**Matías Barreto**


[![Website](https://img.shields.io/badge/Web-matiasbarreto.com-4f46e5?style=flat&logo=google-chrome&logoColor=white)](https://matiasbarreto.com)
[![GitHub](https://img.shields.io/badge/GitHub-mattbarreto-181717?style=flat&logo=github)](https://github.com/mattbarreto)

