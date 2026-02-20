# Supabase - Setup Completo de Base de Datos

Este proyecto ya está preparado para crear **todas las tablas** en Supabase usando Alembic.

## 1. Obtener la cadena de conexión
En Supabase:
1. Ir a `Project Settings` -> `Database`.
2. Copiar la cadena `Connection string` de tipo `URI`.
3. Asegurar `sslmode=require`.

Ejemplo:
`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`

## 2. Configurar `.env`

```env
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
SECRET_KEY=<tu_secret_largo_y_unico>
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

## 3. Ejecutar migraciones (crea todo el esquema)

```powershell
.\venv\Scripts\python.exe -m alembic upgrade head
```

Esto crea:
- `admins`
- `participants`
- `workshops`
- `enrollments`
- `communications`
- `communication_recipients`
- `team_members`
- `workshop_staff_assignments`
- `certificate_centers`
- `certificate_templates`
- `certificate_signers`
- `certificate_issues`
- índices de rendimiento para filtros y joins frecuentes

## 4. Crear admin inicial

```powershell
.\venv\Scripts\python.exe scripts/create_admin.py --email admin@example.com --password admin123
```

## 5. Verificación rápida

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

- App: `http://127.0.0.1:8000/`
- Health: `http://127.0.0.1:8000/health`

## 6. Recomendaciones de producción
- Usar un `SECRET_KEY` fuerte y único.
- No exponer credenciales en frontend ni en repositorio.
- Habilitar backups automáticos en Supabase.
- Evitar `create_all` en runtime: el esquema se gestiona con Alembic.

