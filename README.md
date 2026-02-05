# OfficeCalendar MVP - Hybrid Work Calendar

Replace Excel-based monthly hybrid work planning with a modern web application. Track employee work locations, manage remote day limits, and view team schedules.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Backend:** FastAPI, SQLAlchemy, SQLite
- **Deployment:** Netlify (frontend) + Render (backend)

## Features

- 📅 Team Calendar view with department filtering
- 👤 Personal Calendar Editor with multi-select
- 📊 Remote days tracking (start/end of month)
- 🎨 Status indicators: Office, Remote, Vacation, Night, Trip, Absent
- 🏢 14 pre-configured departments
- 📱 Responsive compact layout
- 🔐 Role-based access (employee, manager, admin)

## Quick Start

### Backend

```bash
cd backend
python -m venv myenv
source myenv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Backend runs on `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

## Environment Variables

### Frontend Development (`frontend/.env`)
```
VITE_API_URL=http://localhost:8000
```

### Frontend Production (`frontend/.env.production`)
```
VITE_API_URL=https://your-backend-url.onrender.com
```

## Database Seeding

The database is automatically seeded with:
- 14 departments
- 3 demo users (admin, alice, bob)
- Calendar months

To reseed:
```bash
cd backend
python -m app.seed
```

## Deployment

### Backend (Render)

1. Go to [render.com](https://render.com)
2. Create New → Web Service
3. Connect your GitHub repository
4. Select branch: `main`
5. Runtime: Python
6. Build command: `pip install -r backend/requirements.txt`
7. Start command: `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
8. Region: Oregon (or your preference)
9. Deploy

**Note:** Copy the deployed URL (e.g., `https://officecalendar-backend.onrender.com`) for the frontend configuration.

### Frontend (Netlify)

1. Go to [netlify.com](https://netlify.com)
2. New site from Git → Select your GitHub repository
3. Build settings:
   - Build command: `npm run build --prefix frontend`
   - Publish directory: `frontend/dist`
4. Environment variables:
   - Add `VITE_API_URL` = `https://your-backend-url.onrender.com` (from Render)
5. Deploy

## API Endpoints

- `GET /health` - Health check
- `GET /calendar/{year}/{month}` - Team calendar
- `GET /users/{user_id}/calendar/{year}/{month}` - User calendar
- `PUT /users/{user_id}/calendar/{year}/{month}` - Update user schedule
- `GET /me/remote-counter?year={year}` - Remote days counter
- `GET /departments` - List all departments
- `POST /users` - Create user
- `GET /users` - List users

## Default Settings

- Annual remote limit: 100 days per employee
- Year: 2026
- Access: X-User-Id header (stub authentication, ready for Azure AD OAuth)

## Demo Credentials

- Admin User (ID: 1) - Department: HR
- Alice Employee (ID: 2) - Department: Engineering
- Bob Manager (ID: 3) - Department: Engineering

## Future Enhancements

- Azure AD OAuth integration
- Public holiday configuration
- Month locking UI for admins
- Export functionality (CSV, PDF)
- Admin UI for department management
- Mobile responsiveness optimization
