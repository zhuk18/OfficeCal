import { useEffect, useMemo, useState } from "react";
import TeamCalendarView from "./TeamCalendarView";
import EmployeeCalendarEditor from "./EmployeeCalendarEditor";
import AdminEmployeeManager from "./AdminEmployeeManager";

type View = "team" | "my-calendar" | "admin";

type User = {
  id: number;
  display_name: string;
  email: string;
  role: "employee" | "manager" | "admin";
  annual_remote_limit: number;
  start_date: string | null;
  additional_vacation_days: number;
  department_id?: number | null;
  department?: { id: number; name: string } | null;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export default function App() {
  const [view, setView] = useState<View>("team");
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/users`, {
      headers: { "X-User-Id": "1" },
    })
      .then((res) => res.json())
      .then((users: User[]) => {
        const user = users[0];
        if (user) {
          setCurrentUser(user);
        }
      })
      .catch(() => {
        setCurrentUser({ 
          id: 1, 
          display_name: "Employee",
          email: "",
          role: "employee",
          annual_remote_limit: 100,
          start_date: null,
          additional_vacation_days: 0,
          department_id: null,
          department: null
        });
      });
  }, []);

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-brand">OfficeCal MVP</div>
        <div className="nav-buttons">
          <button
            className={`nav-btn ${view === "team" ? "active" : ""}`}
            onClick={() => setView("team")}
          >
            Team Calendar
          </button>
          <button
            className={`nav-btn ${view === "my-calendar" ? "active" : ""}`}
            onClick={() => setView("my-calendar")}
          >
            My Schedule
          </button>
          {currentUser?.role === "admin" && (
            <button
              className={`nav-btn ${view === "admin" ? "active" : ""}`}
              onClick={() => setView("admin")}
            >
              Manage Employees
            </button>
          )}
        </div>
      </nav>

      {view === "team" ? (
        <TeamCalendarView />
      ) : view === "my-calendar" && currentUser ? (
        <EmployeeCalendarEditor userId={currentUser.id} userName={currentUser.display_name} />
      ) : view === "admin" && currentUser?.role === "admin" ? (
        <AdminEmployeeManager />
      ) : null}
    </div>
  );
}
