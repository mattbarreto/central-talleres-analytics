# Uso - Central de Talleres

## Levantar servidor

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

## Acceso
1. Abrir `http://127.0.0.1:8000/`
2. Iniciar sesión con:
   - Email: `admin@example.com`
   - Password: `admin123`

## API
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## Módulos funcionales
- Panel
- Talleres
- Participantes
- Inscripciones
- Comunicaciones
- Equipo
- Insights
- Administradores

