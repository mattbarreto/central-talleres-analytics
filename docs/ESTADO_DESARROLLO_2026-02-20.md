# Estado de Desarrollo - 2026-02-20

Última actualización: `2026-02-20 19:59:30 -03:00`  
Base de referencia git: `8cad84e` (último commit en `main`)

## 1) Objetivo del proyecto
Sistema web para gestión de talleres con foco en:
- administración operativa (talleres, participantes, inscripciones, comunicaciones, equipo, admins)
- analítica e insights
- narrativa de datos y reportes imprimibles (PDF)
- preparación para producción con Supabase + despliegue en VPS

## 2) Stack actual (para humanos y agentes IA)
- Backend: `FastAPI` + `SQLAlchemy` + `Alembic`
- DB: `PostgreSQL` (Supabase)
- Frontend: `HTML + CSS + JavaScript` vanilla (hash routes)
- Auth: Bearer token en `localStorage`
- PDF: `reportlab`
- Servido estático desde `app/main.py` en `/static`

## 3) Estado funcional actual
### 3.1 Reportes PDF (mejora principal del día)
Se migró el reporte a descarga de PDF real (sin pestaña en blanco):
- `GET /api/v1/metrics/dashboard-report.pdf`  
  Archivo: `app/api/routes/metrics.py`
- `GET /api/v1/insights/report.pdf`  
  Archivo: `app/api/routes/insights.py`

El frontend descarga por `fetch + blob`:
- `frontend/app.js`:
  - `printDashboardExecutiveReport()` descarga PDF del panel
  - `printInsightsReportPDF()` descarga PDF de insights (con fallback)

### 3.2 Recuperación de narrativa/datos demo
Se agregó script para repoblar datos analíticos cuando la base está vacía:
- `scripts/seed_analytics_demo.py`

Uso:
```powershell
.\venv\Scripts\python.exe scripts/seed_analytics_demo.py --reset
```

## 4) Archivos modificados en working tree (NO commiteados aún)
- `app/api/routes/insights.py`
- `app/api/routes/metrics.py`
- `docs/USO.md`
- `frontend/app.js`
- `frontend/css/dashboard.css`
- `frontend/js/pages/participants.js`
- `frontend/js/pages/workshops.js`
- `frontend/js/ui/components.js`
- `scripts/seed_analytics_demo.py` (nuevo)
- `.env.example.prod` (nuevo)
- `docker-compose.prod.yml` (nuevo)

## 5) Verificación técnica ya realizada
- Compilación Python OK:
  - `app/api/routes/insights.py`
  - `app/api/routes/metrics.py`
  - `scripts/seed_analytics_demo.py`
- Verificación JS OK:
  - `frontend/app.js` (`node --check`)
- Rutas presentes en app:
  - `/api/v1/metrics/dashboard-report.pdf`
  - `/api/v1/insights/report.pdf`

## 6) Cómo retomar mañana (secuencia recomendada)
1. Levantar backend:
```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```
2. Si faltan datos para analytics:
```powershell
.\venv\Scripts\python.exe scripts/seed_analytics_demo.py --reset
```
3. Prueba rápida UI:
- `#dashboard` -> botón **Crear reporte**
- `#insights` -> botón **Imprimir**
- Verificar que descargan PDF correcto, sin pestaña en blanco
4. Revisión visual fina de PDFs y copy en español.
5. Commit y push del estado estable.

## 7) Próximo objetivo (plan acordado)
Preparar backend para producción real:
- diseño definitivo de esquema en Supabase
- migraciones finales y validación de integridad
- conexión productiva en VPS (Docker + Traefik)
- pruebas con usuarios reales

## 8) Riesgos / notas
- Hay cambios amplios en frontend pendientes de consolidación (UI unificada).
- Mantener cuidado con encoding UTF-8 (se corrigieron varios casos de texto roto).
- Antes de deploy: cerrar estado git, generar commit limpio y validar rutas API críticas.

## 9) Checklist de salida (pendiente para próxima sesión)
- [ ] Ejecutar pruebas manuales de reportes PDF con datos reales.
- [ ] Revisar estética final de PDFs (márgenes, jerarquía, tablas largas).
- [ ] Confirmar que todas las vistas comparten misma paleta/sistema visual.
- [ ] Commit + push del estado actual.
- [ ] Iniciar diseño de esquema Supabase definitivo.

____

1. Fase 1 cerrada parcialmente (ya hecha)
                                                                                                                                        
  - service layer, DRY de PDF, jobs async y conexión frontend básica.                                                                   
                                                                                                                                        
  2. Fase 2 inmediata (hoy)                                                                                                             
                                                                                                                                        
  - Validación funcional end-to-end con servidor corriendo.                                                                             
  - Pruebas de carga rápidas (PDF sync vs async, insights overview).                                                                    
  - Ajustes de bugs/regresiones detectadas.                                                                                             
  - Resultado esperado: release candidate estable.                                                                                      
                                                                                                                                        
  3. Fase 3 (24-48h)                                                                                                                    
                                                                                                                                        
  - Optimización SQL más agresiva en insights (menos iteración Python, más agregación DB).                                              
  - Reducir payloads y costos de memoria en escenarios grandes.                                                                         
  - Resultado esperado: mejora medible en p95 y RAM.                                                                                    
                                                                                                                                        
  4. Fase 4 (2-4 días)                                                                                                                  
                                                                                                                                        
  - Refactor fuerte de frontend/app.js:                                                                                                 
      - mover router/hash orchestration a módulo dedicado,                                                                              
      - extraer modal/toast/event wiring global,                                                                                        
      - dejar app.js como bootstrap.                                                                                                    
  - Resultado esperado: bajar complejidad y riesgo de regresión frontend.
                                                                                                                                        
  5. Fase 5 (1 semana)                                                                                                                  
                                                                                                                                        
  - Hardening productivo:                                                                                                               
      - jobs persistentes (Redis/Celery o tabla DB) en vez de memoria,                                                                  
      - expiración/limpieza de artefactos,                                                                                              
      - observabilidad (tiempos por job, errores, colas),                                                                               
      - tests automáticos críticos.                 