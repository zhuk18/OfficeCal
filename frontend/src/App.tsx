import { useEffect, useMemo, useState } from "react";
import TeamCalendarView from "./TeamCalendarView";
import EmployeeCalendarEditor from "./EmployeeCalendarEditor";

type View = "team" | "my-calendar";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export default function App() {
  const [view, setView] = useState<View>("team");
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/users`, {
      headers: { "X-User-Id": "1" },
    })
      .then((res) => res.json())
      .then((users: any[]) => {
        const user = users[0];
        if (user) {
          setCurrentUser({ id: user.id, name: user.display_name });
        }
      })
      .catch(() => {
        setCurrentUser({ id: 1, name: "Employee" });
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
        </div>
      </nav>

      {view === "team" ? (
        <TeamCalendarView />
      ) : (
        currentUser && <EmployeeCalendarEditor userId={currentUser.id} userName={currentUser.name} />
      )}
    </div>
  );
}
