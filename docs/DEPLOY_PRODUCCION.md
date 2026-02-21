# Deploy a Producción (VPS Hostinger)

## Resumen de arquitectura
- App: `dashboard_talleres_api` (FastAPI/Uvicorn) en `/opt/dashboard-talleres`.
- Proxy: Traefik global en stack `root`.
- Red compartida: `root_default` (externa).
- Dominio: `dashboard.matiasbarreto.com`.
- Base de datos productiva: Supabase (PostgreSQL, SSL require).
- Routing activo en VPS: **Traefik File Provider** (las labels del compose son secundarias).

## 1) Pre-requisitos
1. Variables en `.env`:
   - `DATABASE_URL` (Supabase pooler)
   - `SECRET_KEY`
   - `ACCESS_TOKEN_EXPIRE_MINUTES`
   - `SQL_POOL_PRE_PING=false` (recomendado para DB remota)
2. `container_name` fijo:
   - Debe ser `dashboard_talleres_api`.
3. Red externa presente:
   - `root_default`.

## 2) Deploy estándar
```bash
ssh hostinger-vps
cd /opt/dashboard-talleres
git fetch --all
git reset --hard origin/main
docker compose up -d --build --force-recreate
```

## 3) Validación post-deploy
```bash
docker ps | grep dashboard_talleres_api
curl -f http://127.0.0.1:8000/health
python scripts/phase2_smoke.py --base-url http://127.0.0.1:8000 --email admin@example.com --password admin123
```

## 4) Validación de routing público
- Comprobar que `https://dashboard.matiasbarreto.com` responde.
- Si aparece 404 de Traefik, verificar que el archivo dinámico de Traefik para dashboard esté presente y apunte a:
  - `http://dashboard_talleres_api:8000`

## 5) Rollback rápido
```bash
cd /opt/dashboard-talleres
git reset --hard <commit_anterior>
docker compose up -d --build --force-recreate
```

## 6) Notas operativas
- No usar `--reload` para benchmarks o producción.
- Evitar cambiar `container_name` en producción: rompe el mapping del File Provider.
- Mantener backups de DB en Supabase según política del proyecto.
