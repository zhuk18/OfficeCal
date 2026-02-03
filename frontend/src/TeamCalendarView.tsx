import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type DayStatus =
  | "office"
  | "remote"
  | "vacation"
  | "night"
  | "trip"
  | "absent";

type CalendarDay = {
  id: number;
  date: string;
  weekday_name: string;
  is_weekend: boolean;
  is_holiday: boolean;
};

type User = {
  id: number;
  display_name: string;
  email: string;
  role: string;
  annual_remote_limit: number;
  department_id?: number | null;
  department?: { id: number; name: string } | null;
};

type TeamCalendar = {
  month: {
    id: number;
    year: number;
    month: number;
    is_locked: boolean;
    days: CalendarDay[];
  };
  rows: {
    user: User;
    statuses: Record<string, DayStatus | null>;
    notes: Record<string, string | null>;
    remote_remaining_start: number;
    remote_remaining_end: number;
  }[];
};

type RemoteCounter = {
  year: number;
  used: number;
  limit: number;
  remaining: number;
};

const statusLabels: Record<DayStatus, string> = {
  office: "Office",
  remote: "Remotely",
  vacation: "Vacation",
  night: "Night shift",
  trip: "Business trip",
  absent: "Absent/Other",
};

const statusClass: Record<DayStatus, string> = {
  office: "status-office",
  remote: "status-remote",
  vacation: "status-vacation",
  night: "status-night",
  trip: "status-trip",
  absent: "status-absent",
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

function getCurrentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function TeamCalendarView() {
  const [{ year, month }, setYearMonth] = useState(getCurrentYearMonth);
  const [calendar, setCalendar] = useState<TeamCalendar | null>(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [allDepartments, setAllDepartments] = useState<{ id: number; name: string }[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [editingNote, setEditingNote] = useState<{ userId: number; date: string } | null>(null);
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/calendar/${year}/${month}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: TeamCalendar) => setCalendar(data))
      .catch(() => setCalendar(null));

    fetch(`${API_URL}/departments`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { id: number; name: string }[]) => setAllDepartments(data))
      .catch(() => setAllDepartments([]));

    // Fetch current user
    fetch(`${API_URL}/users`, {
      headers: { "X-User-Id": "1" },
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((users: User[]) => {
        if (users.length > 0) {
          setCurrentUser(users[0]);
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [year, month, refreshKey]);

  const handleSaveNote = async (userId: number, date: string) => {
    try {
      const res = await fetch(
        `${API_URL}/users/${userId}/calendar/${year}/${month}/${date}/note`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": "1",
          },
          body: JSON.stringify({ note: noteText }),
        }
      );

      if (res.ok) {
        setEditingNote(null);
        setNoteText("");
        setRefreshKey((k) => k + 1);
      }
    } catch (error) {
      console.error("Error saving note:", error);
    }
  };

  const filteredRows = useMemo(() => {
    if (!calendar) return [];
    return calendar.rows.filter((row) => {
      const matchesSearch = row.user.display_name
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesDepartment =
        department === "all" ||
        (row.user.department && String(row.user.department.id) === department);
      return matchesSearch && matchesDepartment;
    });
  }, [calendar, search, department]);

  const handleExportToExcel = () => {
    if (!calendar) return;

    const monthName = new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    
    // Build header row
    const header = [
      "Employee",
      "Department",
      "Remote left (start)",
      ...calendar.month.days.map((day) => {
        const dateObj = new Date(day.date);
        return `${dateObj.getDate()} ${day.weekday_name}`;
      }),
      "Remote left (end)",
    ];

    // Build data rows
    const data = filteredRows.map((row) => [
      row.user.display_name,
      row.user.department?.name || "",
      row.remote_remaining_start,
      ...calendar.month.days.map((day) => {
        const status = row.statuses[day.date];
        return status ? statusLabels[status as DayStatus][0] : "";
      }),
      row.remote_remaining_end,
    ]);

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    
    // Set column widths
    const colWidths = [20, 20, 15, ...calendar.month.days.map(() => 12), 15];
    ws["!cols"] = colWidths.map((width) => ({ wch: width }));

    // Create workbook and add worksheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, monthName);

    // Export
    XLSX.writeFile(wb, `OfficeCal-${year}-${String(month).padStart(2, "0")}.xlsx`);
  };

  return (
    <>
      <header className="header">
        <div>
          <h1>Team Calendar</h1>
        </div>
        <button
          onClick={handleExportToExcel}
          style={{
            padding: "8px 16px",
            backgroundColor: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          📥 Export to Excel
        </button>
      </header>

      <section className="card filters-with-legend">
        <div className="filters">
          <input
            placeholder="Search by name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value="all">All departments</option>
            {allDepartments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
          <select
            value={`${year}-${month}`}
            onChange={(event) => {
              const [nextYear, nextMonth] = event.target.value.split("-").map(Number);
              setYearMonth({ year: nextYear, month: nextMonth });
            }}
          >
            {Array.from({ length: 12 }, (_, i) => {
              const m = i + 1;
              const optionValue = `${year}-${m}`;
              return (
                <option key={optionValue} value={optionValue}>
                  {new Date(year, m - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </option>
              );
            })}
          </select>
          <select
            value={year}
            onChange={(event) => {
              const newYear = Number(event.target.value);
              setYearMonth({ year: newYear, month });
            }}
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="legend">
          {Object.entries(statusLabels).map(([key, label]) => (
            <span key={key}>
              <span className={`dot ${statusClass[key as DayStatus]}`} /> {label}
            </span>
          ))}
        </div>
      </section>

      <section className="card">
        {!calendar ? (
          <p>Loading calendar…</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Remote left (start)</th>
                  {calendar.month.days.map((day) => {
                    const today = new Date().toISOString().split('T')[0];
                    const isToday = day.date === today;
                    const isWeekend = day.is_weekend;
                    return (
                      <th key={day.id} className={isToday ? "today-header" : isWeekend ? "weekend-header" : ""}>
                        {new Date(day.date).getDate()}
                        <div style={{ fontSize: 10 }}>{day.weekday_name}</div>
                      </th>
                    );
                  })}
                  <th>Remote left (end)</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.user.id}>
                    <td>{row.user.display_name}</td>
                    <td>{row.user.department?.name || "—"}</td>
                    <td>{row.remote_remaining_start}</td>
                    {calendar.month.days.map((day) => {
                      const today = new Date().toISOString().split('T')[0];
                      const status = row.statuses[day.date] as DayStatus | undefined;
                      const note = row.notes[day.date];
                      const isWeekend = day.is_weekend;
                      const isToday = day.date === today;
                      const isEditing = editingNote?.userId === row.user.id && editingNote?.date === day.date;
                      const isAdmin = currentUser?.role === "admin";

                      return (
                        <td
                          key={day.id}
                          className={`${status ? statusClass[status] : "status-empty"} ${isToday ? "today-cell" : isWeekend ? "weekend-cell" : ""}`}
                          style={{ position: "relative", cursor: isAdmin ? "pointer" : "default" }}
                          onDoubleClick={() => {
                            if (isAdmin && !calendar?.month?.is_locked) {
                              setEditingNote({ userId: row.user.id, date: day.date });
                              setNoteText(note || "");
                            }
                          }}
                          title={note || ""}
                        >
                          {isEditing ? (
                            <input
                              type="text"
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              onBlur={() => handleSaveNote(row.user.id, day.date)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleSaveNote(row.user.id, day.date);
                                }
                                if (e.key === "Escape") {
                                  setEditingNote(null);
                                  setNoteText("");
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              maxLength={500}
                              style={{
                                width: "100%",
                                height: "100%",
                                border: "none",
                                padding: "2px",
                                fontSize: "11px",
                              }}
                            />
                          ) : (
                            <>
                              {status ? statusLabels[status][0] : ""}
                              {note && (
                                <div
                                  style={{
                                    fontSize: "8px",
                                    color: "inherit",
                                    marginTop: "2px",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxWidth: "100%",
                                  }}
                                  title={note}
                                >
                                  📝
                                </div>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td>{row.remote_remaining_end}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
