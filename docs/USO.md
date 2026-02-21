# Uso - Central de Talleres

## Levantar servidor

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

## Acceso
1. Abrir `http://127.0.0.1:8000`
2. Iniciar sesión con:
   - Email: `admin@example.com`
   - Password: `admin123`

## Recuperar visualizaciones y reportes (si la base está vacía)

```powershell
.\venv\Scripts\python.exe scripts/seed_analytics_demo.py --reset
```

Opciones útiles:

```powershell
.\venv\Scripts\python.exe scripts/seed_analytics_demo.py --reset --workshops 20 --participants 200 --team-members 24 --days 540
```

Esto carga datos demo para:
- Talleres
- Participantes
- Inscripciones
- Equipo y asignaciones
- Comunicaciones y destinatarios

Con esos datos, `#insights` vuelve a mostrar narrativa y dataviz completas, y la exportación PDF/CSV/Excel/JSON queda usable.

## API
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## Validación Fase 2 (smoke + performance básico)

Con el servidor levantado y credenciales admin válidas:

```powershell
.\venv\Scripts\python.exe scripts/phase2_smoke.py --base-url http://127.0.0.1:8000 --email admin@example.com --password admin123
```

El script valida:
- login y health
- latencia promedio y p95 de `insights/overview`
- exportación PDF sincrónica de insights
- jobs asíncronos de PDF (insights y dashboard): creación, polling, descarga
- concurrencia básica de lecturas mientras corre un job async

## Módulos funcionales
- Panel
- Talleres
- Participantes
- Inscripciones
- Comunicaciones
- Equipo
- Insights
- Administradores
