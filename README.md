# OfficeCal MVP

Hybrid work calendar MVP based on the provided technical specification. The repository contains a FastAPI backend and a React + Vite frontend.

## Structure

- backend/ — FastAPI API, SQLite by default
- frontend/ — React UI (Excel-like grid)

## Backend setup

1. Create a virtual environment and install dependencies:

   - `pip install -r backend/requirements.txt`

2. Run the API:

   - `uvicorn app.main:app --reload --app-dir backend`

3. The API is available at http://localhost:8000

### Seed demo data

- `python -m app.seed` (run from `backend/`)

### API notes

- Auth is stubbed via `X-User-Id` header.
- Admin-only endpoints enforce `role=admin`.
- Calendar months are auto-generated when requested.

## Frontend setup

1. Install dependencies:

   - `npm install` inside `frontend/`

2. Start the dev server:

   - `npm run dev` inside `frontend/`

3. Configure API URL (optional):

   - Create `frontend/.env` with `VITE_API_URL=http://localhost:8000`

## MVP coverage

- Monthly calendar generation (backend)
- Employee editing (API endpoint)
- Company calendar view (API + React grid)
- Remote-work counter (API)
- Color-coded statuses
- Department filters (frontend)
- Admin actions (lock/unlock, limits via user update)

## Next steps

- Azure AD OAuth integration
- Department management UI
- Employee self-edit UI (per-day status picker)
- Public holiday configuration
- Export/pagination
