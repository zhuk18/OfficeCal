import { useState } from "react";
import TeamCalendarView from "./TeamCalendarView";
import EmployeeCalendarEditor from "./EmployeeCalendarEditor";
import AdminEmployeeManager from "./AdminEmployeeManager";
import { useCurrentUser } from "./hooks/useApi";

type View = "team" | "my-calendar" | "admin";

export default function App() {
  const [view, setView] = useState<View>("team");
  const { user: currentUser, loading } = useCurrentUser();

  if (loading) {
    return (
      <div className="app">
        <div className="loading-container">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-brand">OfficeCalendar</div>
        <div className="nav-buttons">
          <button
            className={`nav-btn ${view === "team" ? "active" : ""}`}
            onClick={() => setView("team")}
            aria-label="View team calendar"
          >
            Team Calendar
          </button>
          <button
            className={`nav-btn ${view === "my-calendar" ? "active" : ""}`}
            onClick={() => setView("my-calendar")}
            aria-label="View my schedule"
          >
            My Schedule
          </button>
          {currentUser?.role === "admin" && (
            <button
              className={`nav-btn ${view === "admin" ? "active" : ""}`}
              onClick={() => setView("admin")}
              aria-label="Manage employees"
            >
              Manage Employees
            </button>
          )}
        </div>
      </nav>

      <main>
        {view === "team" && <TeamCalendarView />}
        {view === "my-calendar" && currentUser && (
          <EmployeeCalendarEditor
            userId={currentUser.id}
            userName={currentUser.display_name}
          />
        )}
        {view === "admin" && currentUser?.role === "admin" && (
          <AdminEmployeeManager />
        )}
      </main>
    </div>
  );
}
