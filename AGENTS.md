# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains the FastAPI backend.
- `app/api/routes/` holds versioned HTTP endpoints (auth, workshops, participants, metrics, certificates).
- `app/models/`, `app/schemas/`, and `app/crud/` separate persistence models, Pydantic contracts, and data-access logic.
- `app/core/` stores config and security helpers; `app/db/` handles engine/session setup.
- `frontend/` is a static client (`index.html`, `app.js`, `styles.css`) served by `app/main.py`.
- `alembic/` and `alembic.ini` manage schema migrations.
- `docs/` contains operational notes; `generated/certificates/` stores generated PDF outputs.

## Build, Test, and Development Commands
- `python -m venv venv` creates the local virtual environment.
- `./venv/Scripts/pip.exe install -r requirements.txt` installs backend dependencies.
- `./venv/Scripts/alembic.exe upgrade head` applies database migrations.
- `./venv/Scripts/uvicorn.exe app.main:app --reload --port 8000` runs API + static frontend locally.
- `./venv/Scripts/python.exe test_api.py` runs the current API smoke script against a live local server.

## Coding Style & Naming Conventions
- Follow PEP 8: 4-space indentation, clear imports, and type-aware FastAPI/Pydantic patterns.
- Use `snake_case` for modules, functions, and variables; use `PascalCase` for ORM/Pydantic classes.
- Keep route files domain-focused (`workshops.py`, `team_members.py`) and mirror names across `models/`, `schemas/`, and `crud/` when possible.
- There is no enforced formatter/linter config in-repo; keep changes consistent with surrounding code.

## Testing Guidelines
- Current tests are smoke-style (`test_api.py`) and require `http://127.0.0.1:8000` running.
- For new work, add focused API tests (auth, validation, CRUD success/failure paths) and keep filenames as `test_<area>.py`.
- Validate critical flows manually via `http://127.0.0.1:8000/docs` when touching routes or schemas.

## Commit & Pull Request Guidelines
- `.git` history is not available in this workspace snapshot, so no verified local commit convention can be derived.
- Recommended format: `type(scope): concise summary` (example: `feat(certificates): add signer CRUD endpoint`).
- PRs should include: purpose, impacted modules, migration/env changes, test evidence (command output), and UI screenshots for `frontend/` updates.
