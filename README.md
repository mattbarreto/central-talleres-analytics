<p align="right">
  <a href="./README.md"><img src="https://img.shields.io/badge/Idioma-Espa%C3%B1ol-0b7285?style=for-the-badge" alt="Leer en Español" /></a>
  <a href="./en/README.md"><img src="https://img.shields.io/badge/Language-English-1f6feb?style=for-the-badge" alt="Read in English" /></a>
</p>

<p align="center">
  <h1 align="center">Central de Talleres</h1>
  <p align="center">
    Plataforma de gestión operativa y analítica de talleres educativos.
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

## Qué es

**Central de Talleres** ayuda a organizaciones educativas y culturales a gestionar la operación diaria y la lectura analítica de talleres desde una sola plataforma.

| Módulo | Descripción |
|---|---|
| 🎓 Talleres y Cohortes | Crear, programar y seguir el ciclo de vida de cada taller. |
| 👥 Participantes | Gestionar inscripciones, estados (activo/finalizado/baja) y perfiles. |
| 📢 Comunicaciones | Enviar mensajes y mantener historial operativo. |
| 📊 Dashboard e Insights | Monitorear KPIs operativos, tendencias y reportes narrativos. |
| 📜 Certificados | Emitir certificados PDF con verificación por código único. |
| 👤 Equipo | Administrar docentes, coordinadores y administradores. |
| 🔒 Seguridad | Auditoría global, hardening de exportaciones y revocación de tokens. |

---

## Stack tecnológico

| Capa | Tecnologías |
|---|---|
| Backend | FastAPI · SQLAlchemy · Alembic · JWT (python-jose) |
| Frontend | HTML · CSS · JavaScript vanilla · Hash-routing SPA |
| Base de datos | PostgreSQL / Supabase (prod) · SQLite (dev local) |
| Reportes PDF | ReportLab (diseño editorial + data storytelling) |
| Infraestructura | Docker · Docker Compose · Traefik · GitHub Actions CI |

---

## Inicio rápido

### Prerrequisitos

- Python 3.12+
- pip
- Git
- Node.js 20+ (frontend)

### Instalación local

```powershell
# 1) Clonar repositorio
git clone https://github.com/mattbarreto/central-talleres-analytics.git
cd central-talleres-analytics

# 2) Crear entorno virtual e instalar backend
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt

# 3) Instalar frontend
cd frontend
npm install
cd ..

# 4) Configurar variables
Copy-Item .env.example .env
# Editar .env con tus valores

# 5) Aplicar migraciones
.\venv\Scripts\python.exe -m alembic upgrade head

# 6) Crear administrador inicial
.\venv\Scripts\python.exe -m scripts.create_admin --email admin@example.com --password Admin123! --first-name Super --last-name Admin --role superadmin

# 7) Levantar API
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# (Opcional) Frontend con HMR
cd frontend
npm run dev
```

### Docker (desarrollo)

```bash
docker compose up --build
```

La imagen Docker compila el frontend con Vite y sirve `frontend/dist` en runtime.

### Compose de producción (portable)

```bash
cp docker-compose.prod.example.yml docker-compose.prod.yml
cp .env.example.prod .env

# Editar .env antes de desplegar:
# - DATABASE_URL
# - SECRET_KEY
# - APP_DOMAIN
# - PROXY_NETWORK

docker compose -f docker-compose.prod.yml up -d --build --force-recreate
docker compose -f docker-compose.prod.yml exec app alembic upgrade head
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
# Suite completa
python -m pytest tests

# Validación sintáctica backend
python -m compileall app

# Validación sintáctica frontend
node --check frontend/js/pages/dashboard.js
```

---

## Novedades UI recientes

- **Radar operativo en card "Hoy"**: la card prioriza encuentros en curso, luego próximos, excluye finalizados, limita la vista inmediata y deriva el resto a **Ver agenda completa**.
- **Superficies de lectura operativa**: drawers y paneles de inspección fueron unificados con mejor jerarquía visual, spacing de header y contención consistente.
- **Sidebar colapsada refinada**: mejor legibilidad de navegación, sin barras de desplazamiento en estado colapsado y footer inferior alineado.

---

## Variables de entorno

Copiar `.env.example` y completar los valores requeridos.

| Variable | Descripción | Requerida |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión (PostgreSQL o SQLite). | ✅ |
| `SECRET_KEY` | Clave secreta para firma JWT. | ✅ |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Duración del access token. | ✅ |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | Duración del refresh token. | ✅ |
| `COOKIE_SECURE` | Restringe cookies a HTTPS (`true`/`false`). | ✅ |
| `COOKIE_SAMESITE` | Política SameSite (`Lax`, `Strict`, `None`). | ✅ |
| `CORS_ORIGINS` | Orígenes permitidos (separados por coma). | ✅ |
| `REPORT_JOBS_MAX_JOBS` | Máximo de jobs de reportes concurrentes. | ✅ |

---

## Estructura del proyecto

```text
central-talleres-analytics/
├── app/                  # Backend (API, models, schemas, services, CRUD)
│   ├── api/routes/       # Endpoints REST agrupados por dominio
│   ├── core/             # Configuración, seguridad y utilidades
│   ├── models/           # Modelos SQLAlchemy
│   ├── schemas/          # Schemas Pydantic
│   └── services/         # Lógica de negocio
├── alembic/              # Migraciones de base de datos
├── frontend/             # SPA vanilla (HTML/CSS/JS)
├── scripts/              # Scripts auxiliares
├── tests/                # Suite de tests automatizados
├── docs/                 # Documentación operativa y deploy
├── .github/workflows/    # CI con GitHub Actions
└── Dockerfile            # Imagen de producción
```

---

## Base de datos y migraciones

El esquema se gestiona exclusivamente con **Alembic**. No se usa `create_all()` en runtime.

```powershell
# Aplicar migraciones pendientes
.\venv\Scripts\python.exe -m alembic upgrade head

# Crear nueva migración
.\venv\Scripts\python.exe -m alembic revision --autogenerate -m "descripcion"
```

---

## Producción

La plataforma está preparada para despliegue con Docker y configuración portable para entornos públicos OSS.

---

## Estado del proyecto

El proyecto se encuentra en **Release / Stable Beta**. Los módulos core (talleres, participantes, equipo, seguridad y analítica operativa) están robustecidos para operación real.

Como diferencial, incluye un **asistente conversacional 100% client-side** con arquitectura multi-proveedor (Gemini, OpenAI, Anthropic y Ollama) integrado al flujo de comunicaciones.

---

## Autor

**Matías Barreto**

[![Website](https://img.shields.io/badge/Web-matiasbarreto.com-4f46e5?style=flat&logo=google-chrome&logoColor=white)](https://matiasbarreto.com)
[![GitHub](https://img.shields.io/badge/GitHub-mattbarreto-181717?style=flat&logo=github)](https://github.com/mattbarreto)

