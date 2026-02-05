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
  is_workday_override: boolean;
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
    const [editingCell, setEditingCell] = useState<{ userId: number; date: string; status: DayStatus | null; note: string; isWeekend: boolean; isWorkdayOverride: boolean } | null>(null);
  const [noteText, setNoteText] = useState("");
    const [selectedStatus, setSelectedStatus] = useState<DayStatus>("office");
  const [statusFilter, setStatusFilter] = useState<DayStatus | null>(null);

  const isNonWorkingDay = (day: CalendarDay) =>
    day.is_holiday || (day.is_weekend ? !day.is_workday_override : day.is_workday_override);

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
    fetch(`${API_URL}/users`, { signal: controller.signal })
      .then((res) => res.json())
      .then((users: User[]) => {
        const adminUser = users.find((u) => u.role === "admin");
        const user = adminUser || users[0];
        if (user) setCurrentUser(user);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [year, month, refreshKey]);

  const handleSaveNote = async (userId: number, date: string) => {
    const adminId = currentUser?.id ?? 1;
    try {
      const res = await fetch(
        `${API_URL}/users/${userId}/calendar/${year}/${month}/${date}/note`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": String(adminId),
          },
            body: JSON.stringify({ note: noteText, status: selectedStatus }),
        }
      );

      if (res.ok) {
          setEditingCell(null);
        setNoteText("");
        setRefreshKey((k) => k + 1);
      }
    } catch (error) {
      console.error("Error saving note:", error);
    }
  };

  const handleClearStatus = async (userId: number, date: string) => {
    const adminId = currentUser?.id ?? 1;
    try {
      const res = await fetch(
        `${API_URL}/users/${userId}/calendar/${year}/${month}/${date}/note`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": String(adminId),
          },
          body: JSON.stringify({ status: "clear", note: "" }),
        }
      );

      if (res.ok) {
        setEditingCell(null);
        setNoteText("");
        setRefreshKey((k) => k + 1);
      }
    } catch (error) {
      console.error("Error clearing status:", error);
    }
  };

  const handleToggleWorkdayOverride = async (date: string, isWorkdayOverride: boolean) => {
    const adminId = currentUser?.id ?? 1;
    try {
      const res = await fetch(
        `${API_URL}/months/${year}/${month}/days/${date}/workday`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": String(adminId),
          },
          body: JSON.stringify({ is_workday_override: isWorkdayOverride }),
        }
      );

      if (res.ok) {
        setEditingCell((prev) =>
          prev && prev.date === date
            ? { ...prev, isWorkdayOverride: isWorkdayOverride }
            : prev
        );
        setRefreshKey((k) => k + 1);
      }
    } catch (error) {
      console.error("Error updating workday override:", error);
    }
  };

  const handleToggleHoliday = async (date: string, isHoliday: boolean) => {
    const adminId = currentUser?.id ?? 1;
    try {
      const res = await fetch(
        `${API_URL}/months/${year}/${month}/days/${date}/holiday`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": String(adminId),
          },
          body: JSON.stringify({ is_holiday: isHoliday }),
        }
      );

      if (res.ok) {
        setRefreshKey((k) => k + 1);
      }
    } catch (error) {
      console.error("Error updating holiday status:", error);
    }
  };

  const filteredRows = useMemo(() => {
    if (!calendar) return [];
    const today = new Date().toISOString().split("T")[0];
    return calendar.rows.filter((row) => {
      const matchesSearch = row.user.display_name
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesDepartment =
        department === "all" ||
        (row.user.department && String(row.user.department.id) === department);
      const matchesStatus = !statusFilter || row.statuses[today] === statusFilter;
      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [calendar, search, department, statusFilter]);

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
    XLSX.writeFile(wb, `OfficeCalendar-${year}-${String(month).padStart(2, "0")}.xlsx`);
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
          {Object.entries(statusLabels).map(([key, label]) => {
            const statusKey = key as DayStatus;
            const isActive = statusFilter === statusKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(isActive ? null : statusKey)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "14px",
                  border: isActive ? "2px solid #0ea5e9" : "1px solid #e2e8f0",
                  background: isActive ? "#e0f2fe" : "white",
                  borderRadius: "999px",
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
                title="Filter by today's status"
              >
                <span className={`dot ${statusClass[statusKey]}`} /> {label}
              </button>
            );
          })}
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
                    const isNonWorking = isNonWorkingDay(day);
                    return (
                      <th
                        key={day.id}
                        className={`${isToday ? "today-header" : isNonWorking ? "weekend-header" : ""} ${day.is_weekend && day.is_workday_override ? "workday-override-header" : ""}`}
                      >
                        {new Date(day.date).getDate()}
                        <div style={{ fontSize: 10 }}>{day.weekday_name}</div>
                        {day.is_weekend && day.is_workday_override && <div style={{ fontSize: 9 }}>Workday</div>}
                        {!day.is_weekend && day.is_workday_override && <div style={{ fontSize: 9 }}>Locked</div>}
                        {day.is_holiday && <div style={{ fontSize: 9 }}>Holiday</div>}
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
                      const isNonWorking = isNonWorkingDay(day);
                      const isToday = day.date === today;
                      const isAdmin = currentUser?.role === "admin";

                      return (
                        <td
                          key={day.id}
                          className={`${status ? statusClass[status] : "status-empty"} ${isToday ? "today-cell" : isNonWorking ? "weekend-cell" : ""}`}
                          style={{ position: "relative", cursor: isAdmin ? "pointer" : "default" }}
                            onClick={() => {
                            if (isAdmin && !calendar?.month?.is_locked) {
                                setEditingCell({ 
                                  userId: row.user.id, 
                                  date: day.date,
                                  status: status || null,
                                note: note || "",
                                isWeekend: day.is_weekend,
                                isWorkdayOverride: day.is_workday_override
                                });
                              setNoteText(note || "");
                                setSelectedStatus(status || "office");
                            }
                          }}
                          title={note || ""}
                        >
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

        {editingCell && currentUser?.role === "admin" && (
          <div className="modal-overlay" onClick={() => setEditingCell(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "400px" }}>
              <div className="modal-header">
                <h3>Edit Day Status & Note</h3>
                <button className="close-btn" onClick={() => setEditingCell(null)}>✕</button>
              </div>
              <div style={{ padding: "20px" }}>
                <div className="form-group">
                  <label>Workday Lock</label>
                  <div style={{ marginTop: "8px" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        handleToggleWorkdayOverride(
                          editingCell.date,
                          !editingCell.isWorkdayOverride
                        )
                      }
                    >
                      {editingCell.isWeekend
                        ? editingCell.isWorkdayOverride
                          ? "Lock Weekend"
                          : "Unlock Weekend"
                        : editingCell.isWorkdayOverride
                        ? "Unlock Workday"
                        : "Lock Workday"}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Mark as Holiday</label>
                  <div style={{ marginTop: "8px" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        handleToggleHoliday(
                          editingCell.date,
                            !calendar?.month?.days.find((d) => d.date === editingCell.date)?.is_holiday
                        )
                      }
                      style={{
                          backgroundColor: calendar?.month?.days.find((d) => d.date === editingCell.date)?.is_holiday ? "#ef4444" : "#94a3b8",
                      }}
                    >
                        {calendar?.month?.days.find((d) => d.date === editingCell.date)?.is_holiday ? "Remove Holiday" : "Mark as Holiday"}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                    {(["office", "remote", "vacation", "night", "trip", "absent"] as DayStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`status-btn ${statusClass[status]}`}
                        style={{
                          padding: "8px 12px",
                          border: selectedStatus === status ? "3px solid #000" : "none",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontWeight: selectedStatus === status ? "bold" : "500",
                        }}
                        onClick={() => setSelectedStatus(status)}
                      >
                        {statusLabels[status]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: "16px" }}>
                  <label>Note (optional)</label>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    maxLength={500}
                    placeholder="Add a note for this day..."
                    style={{
                      width: "100%",
                      minHeight: "80px",
                      padding: "8px",
                      borderRadius: "8px",
                      border: "1px solid #d7dce5",
                      fontSize: "14px",
                      resize: "vertical",
                    }}
                  />
                  <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                    {noteText.length}/500 characters
                  </div>
                </div>
                <div className="form-actions" style={{ marginTop: "20px" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEditingCell(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleClearStatus(editingCell.userId, editingCell.date)}
                  >
                    Clear Status
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setNoteText("")}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleSaveNote(editingCell.userId, editingCell.date)}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
