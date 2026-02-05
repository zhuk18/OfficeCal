# OfficeCalendar - Developer Quick Reference

## Quick Start

### Backend Development
```bash
cd backend
source myenv/bin/activate
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/api/docs

### Frontend Development  
```bash
cd frontend
npm install
npm run dev
```

Dev server: http://localhost:5173

---

## Backend API Reference

### Environment Variables
```bash
ENVIRONMENT=development          # development or production
DATABASE_URL=sqlite:///...       # Database connection string
ALLOWED_ORIGINS=*                # CORS allowed origins
SQL_ECHO=false                   # Log SQL statements
```

### Authentication
All endpoints require `X-User-Id` header:
```bash
curl -H "X-User-Id: 1" http://localhost:8000/users
```

### Key Endpoints

**Users**
- `GET /users` - List all users
- `POST /users` - Create user
- `PUT /users/{id}` - Update user
- `DELETE /users/{id}` - Delete user (admin only)

**Calendar**
- `GET /calendar/{year}/{month}` - Team calendar
- `GET /users/{id}/calendar/{year}/{month}` - User calendar
- `PUT /users/{id}/calendar/{year}/{month}` - Update calendar
- `POST /months/{year}/{month}/lock` - Lock month (admin only)

**Reports**
- `GET /me/remote-counter?year=2024` - Remote days used
- `GET /me/vacation-counter?year=2024` - Vacation days used
- `GET /users/{id}/vacation-dates?year=2024` - User vacation dates
- `GET /who-is-in-office?target_date=2024-01-15` - Who's in office

**Admin**
- `POST /admin/seed` - Initialize database with sample data

---

## Frontend Development Guide

### Import Types
```typescript
import type { User, CalendarMonth, DayStatus } from "@/types";
```

### Use Custom Hooks
```typescript
// For fetching user
const { user, loading, error } = useCurrentUser();

// For team calendar
const { calendar, loading, refresh } = useTeamCalendar(2024, 1);

// For users list
const { users, loading, refresh } = useUsers();
```

### Use API Client
```typescript
import { api } from "@/utils/api";

// Call API
const users = await api.users.list();
const counter = await api.counters.remote(userId, 2024);

// Or use generic apiFetch
const data = await apiFetch<MyType>("/endpoint", {
  method: "POST",
  body: JSON.stringify(payload),
  userId: 1,
});
```

### Use Constants
```typescript
import { STATUS_LABELS, STATUS_CLASSES, API_URL } from "@/config/constants";

// Status display
<span className={STATUS_CLASSES[status]}>
  {STATUS_LABELS[status]}
</span>
```

### Date Helpers
```typescript
import { formatDate, getCurrentYearMonth, getMonthName } from "@/utils/dateHelpers";

const now = getCurrentYearMonth(); // { year: 2024, month: 1 }
const formatted = formatDate(new Date()); // "2024-01-15"
const month = getMonthName(1); // "January"
```

---

## Code Patterns

### Backend: Adding a New Endpoint

```python
@app.get(
    "/path",
    response_model=schemas.ResponseSchema,
    tags=["category"],
)
def endpoint_name(
    param: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Endpoint description."""
    try:
        # Your logic here
        result = db.query(models.YourModel).first()
        return result
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed: {str(e)}",
        )
```

### Frontend: Adding a Custom Hook

```typescript
export function useMyData() {
  const [data, setData] = useState<MyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetch = async () => {
      try {
        setLoading(true);
        const result = await api.path.method();
        if (mounted) setData(result);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetch();

    return () => {
      mounted = false;
    };
  }, []);

  return { data, loading, error };
}
```

---

## Testing

### Backend Unit Test Example
```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_list_users():
    response = client.get("/users", headers={"X-User-Id": "1"})
    assert response.status_code == 200
    assert isinstance(response.json(), list)
```

### Frontend Unit Test Example
```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { useCurrentUser } from "@/hooks/useApi";

test("loads user data", async () => {
  render(<MyComponent />);
  
  await waitFor(() => {
    expect(screen.getByText("User Name")).toBeInTheDocument();
  });
});
```

---

## Debugging

### Backend
```python
# Check logs
logger.debug(f"Debug info: {variable}")
logger.info(f"Info: {message}")
logger.warning(f"Warning: {message}")
logger.error(f"Error: {message}", exc_info=True)

# API response
print(response.json())

# Database queries
export SQL_ECHO=true
```

### Frontend
```typescript
// Console logging
console.log("Debug:", variable);
console.error("Error:", error);

// React DevTools
import React from 'react';
// In browser: React DevTools extension

// Network tab
// Browser DevTools -> Network tab -> Inspect API calls
```

---

## Common Issues & Solutions

### Issue: Database locked (SQLite)
**Solution**: Close previous connections, use connection pooling
```python
# Check in database.py config
engine = create_engine(DATABASE_URL, poolclass=pool.StaticPool)
```

### Issue: CORS errors
**Solution**: Update ALLOWED_ORIGINS
```bash
export ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Issue: Type errors in frontend
**Solution**: Check types/index.ts and ensure consistency
```bash
npx tsc --noEmit # Check all type errors
```

### Issue: API returns 401 Unauthorized
**Solution**: Ensure X-User-Id header is sent
```typescript
const { user } = useCurrentUser(); // Will have userId
```

---

## Performance Tips

### Backend
1. **Use indexes** on frequently queried columns
2. **Lazy load** relationships to avoid N+1 queries
3. **Use scalars()** for single result queries
4. **Enable GZIP** for large responses
5. **Monitor logs** for slow queries

### Frontend
1. **Use useCallback** for memoized functions
2. **Use custom hooks** to avoid prop drilling
3. **Lazy load** components with React.lazy
4. **Cancel requests** with AbortController
5. **Use DevTools** to check render performance

---

## Deployment Checklist

- [ ] Set ENVIRONMENT=production
- [ ] Configure DATABASE_URL for production database
- [ ] Set ALLOWED_ORIGINS to production domain
- [ ] Set SQL_ECHO=false
- [ ] Review and update security headers
- [ ] Setup SSL/TLS certificate
- [ ] Configure backup strategy
- [ ] Setup monitoring and alerting
- [ ] Review error logs and fix issues
- [ ] Load test the application
- [ ] Prepare rollback plan

---

## Resources

### Documentation
- [FastAPI Docs](https://fastapi.tiangolo.com)
- [SQLAlchemy 2.0](https://docs.sqlalchemy.org/20/)
- [Pydantic v2](https://docs.pydantic.dev/latest/)
- [React Hooks](https://react.dev/reference/react)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Tools
- API Testing: Postman, Insomnia, Thunder Client
- Database: DBeaver, TablePlus, pgAdmin
- Frontend DevTools: React DevTools, Redux DevTools

---

## Contact & Support

For issues or questions about the refactored codebase:
1. Check REFACTORING.md for detailed explanations
2. Review code comments and docstrings
3. Check API docs at /api/docs (development mode)
4. Look at type definitions in types/index.ts

---

**Last Updated**: February 4, 2026
**Framework Versions**: Python 3.12, FastAPI 0.115, React 18+
