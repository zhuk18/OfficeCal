import { useEffect, useState } from "react";
import { EmployeeCard } from "./EmployeeCard";

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

type UserCalendar = {
  user: {
    id: number;
    display_name: string;
    email: string;
    role: string;
    annual_remote_limit: number;
    start_date: string | null;
    additional_vacation_days: number;
    department_id?: number | null;
    department?: { id: number; name: string } | null;
    vacation_days?: Array<{ vacation_type: string; days_per_year: number }>;
  };
  month: {
    id: number;
    year: number;
    month: number;
    is_locked: boolean;
    days: CalendarDay[];
  };
  items: { date: string; status: DayStatus }[];
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

const allStatuses: DayStatus[] = ["office", "remote", "vacation", "night", "trip", "absent"];

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface Props {
  userId: number;
  userName: string;
}

export default function EmployeeCalendarEditor({ userId, userName }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [calendar, setCalendar] = useState<UserCalendar | null>(null);
  const [remoteCounter, setRemoteCounter] = useState<RemoteCounter | null>(null);
  const [vacationCounter, setVacationCounter] = useState<VacationCounter | null>(null);
  const [statuses, setStatuses] = useState<Record<string, DayStatus>>({});
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<{ top: number; left: number } | null>(null);

  const isNonWorkingDay = (day: CalendarDay) =>
    day.is_holiday || (day.is_weekend ? !day.is_workday_override : day.is_workday_override);

  useEffect(() => {
    if (!userId) return;

    const controller = new AbortController();
    
    fetch(`${API_URL}/users/${userId}/calendar/${year}/${month}`, {
      headers: { "X-User-Id": String(userId) },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: UserCalendar) => {
        setCalendar(data);
        const statusMap: Record<string, DayStatus> = {};
        data.items.forEach((item) => {
          statusMap[item.date] = item.status;
        });
        setStatuses(statusMap);
        setError(null);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to load calendar:", err);
          setError(`Failed to load calendar: ${err.message}`);
        }
      });

    fetch(`${API_URL}/me/remote-counter?year=${year}`, {
      headers: { "X-User-Id": String(userId) },
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data: RemoteCounter) => setRemoteCounter(data))
      .catch(() => setRemoteCounter(null));

    fetch(`${API_URL}/me/vacation-counter?year=${year}`, {
      headers: { "X-User-Id": String(userId) },
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data: VacationCounter) => setVacationCounter(data))
      .catch(() => setVacationCounter(null));

    return () => controller.abort();
  }, [year, month, userId]);

  const handleDayClick = (date: string, isNonWorking: boolean, event: React.MouseEvent) => {
    // Skip non-working days
    if (isNonWorking) return;

    // Calculate position for context menu - align to clicked cell
    const cell = event.currentTarget as HTMLElement;
    const rect = cell.getBoundingClientRect();

    setPickerPosition({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
    });

    if (event.shiftKey && selectedDays.size > 0) {
      // Shift+click to select range (skip non-working days)
      const selectedArray = Array.from(selectedDays);
      const lastSelected = selectedArray[selectedArray.length - 1];
      const lastDate = new Date(lastSelected);
      const clickedDate = new Date(date);

      const start = lastDate < clickedDate ? lastDate : clickedDate;
      const end = lastDate < clickedDate ? clickedDate : lastDate;

      const newSelected = new Set(selectedDays);
      if (calendar) {
        calendar.month.days.forEach((day) => {
          // Skip non-working days in range selection
          if (isNonWorkingDay(day)) return;
          
          const dayDate = new Date(day.date);
          if (dayDate >= start && dayDate <= end) {
            newSelected.add(day.date);
          }
        });
      }
      setSelectedDays(newSelected);
    } else if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd+click for multi-select
      const newSelected = new Set(selectedDays);
      if (newSelected.has(date)) {
        newSelected.delete(date);
      } else {
        newSelected.add(date);
      }
      setSelectedDays(newSelected);
    } else {
      // Single click
      setSelectedDays(new Set([date]));
    }
  };

  const handleStatusSelect = (status: DayStatus) => {
    if (selectedDays.size === 0) return;
    
    setStatuses((prev) => {
      const next = { ...prev };
      selectedDays.forEach((date) => {
        next[date] = status;
      });
      return next;
    });
    setSelectedDays(new Set());
    setPickerPosition(null);
    setSaved(false);
  };

  const handleClearDays = () => {
    if (selectedDays.size === 0) return;
    
    setStatuses((prev) => {
      const next = { ...prev };
      selectedDays.forEach((date) => {
        delete next[date];
      });
      return next;
    });
    setSelectedDays(new Set());
    setPickerPosition(null);
    setSaved(false);
  };

  type VacationCounter = {
    year: number;
    allowed: number;
    used: number;
    remaining: number;
  };

  const handleSave = async () => {
    if (!calendar) return;

    setSaving(true);
    try {
      const items = Object.entries(statuses).map(([date, status]) => ({
        date,
        status,
      }));

      const response = await fetch(
        `${API_URL}/users/${userId}/calendar/${year}/${month}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": String(userId),
          },
          body: JSON.stringify({ items }),
        }
      );

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        
        // Recalculate remote counter
        fetch(`${API_URL}/me/remote-counter?year=${year}`, {
          headers: { "X-User-Id": String(userId) },
        })
          .then((res) => res.json())
          .then((data: RemoteCounter) => setRemoteCounter(data))
          .catch(() => {});

        // Recalculate vacation counter
        fetch(`${API_URL}/me/vacation-counter?year=${year}`, {
          headers: { "X-User-Id": String(userId) },
        })
          .then((res) => res.json())
          .then((data: VacationCounter) => setVacationCounter(data))
          .catch(() => {});
      }
    } catch (error) {
      console.error("Error saving calendar:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPreviousMonth = async () => {
    if (!calendar) return;

    setCopying(true);
    try {
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;

      const response = await fetch(
        `${API_URL}/users/${userId}/calendar/${prevYear}/${prevMonth}`,
        {
          headers: { "X-User-Id": String(userId) },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to load previous month");
      }

      const prevCalendar: UserCalendar = await response.json();
      
      // Helper to get week number within month and weekday
      const getWeekInfo = (dateStr: string) => {
        const date = new Date(dateStr);
        const dayOfMonth = date.getDate();
        const weekOfMonth = Math.ceil(dayOfMonth / 7);
        const weekday = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
        return { weekOfMonth, weekday };
      };

      // Create a map of (weekOfMonth, weekday) to status from previous month
      const prevStatusesByWeekday = new Map<string, DayStatus>();
      prevCalendar.items.forEach((item) => {
        const { weekOfMonth, weekday } = getWeekInfo(item.date);
        const key = `${weekOfMonth}-${weekday}`;
        prevStatusesByWeekday.set(key, item.status);
      });

      // Apply to current month, matching by week position and weekday
      const newStatuses: Record<string, DayStatus> = { ...statuses };
      calendar.month.days.forEach((day) => {
        // Skip non-working days
        if (isNonWorkingDay(day)) return;
        
        const { weekOfMonth, weekday } = getWeekInfo(day.date);
        const key = `${weekOfMonth}-${weekday}`;
        const prevStatus = prevStatusesByWeekday.get(key);
        
        if (prevStatus) {
          newStatuses[day.date] = prevStatus;
        }
      });

      setStatuses(newStatuses);
      setSaved(false);
    } catch (error) {
      console.error("Error copying previous month:", error);
      setError(error instanceof Error ? error.message : "Failed to copy previous month");
      setTimeout(() => setError(null), 3000);
    } finally {
      setCopying(false);
    }
  };

  const handleEraseMonth = () => {
    if (!calendar) return;
    
    if (confirm("Are you sure you want to clear all schedule entries for this month?")) {
      setStatuses({});
      setSelectedDays(new Set());
      setSaved(false);
    }
  };

  const monthName = new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <section className="card filters-with-legend">
        <div className="filters-left">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(year, m - 1).toLocaleDateString("en-US", { month: "long" })}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            className="copy-prev-btn"
            onClick={handleCopyPreviousMonth}
            disabled={copying || !calendar}
            title="Copy schedule from previous month"
          >
            {copying ? "Copying..." : "📋 Copy Previous Month"}
          </button>
          <button
            className="erase-btn"
            onClick={handleEraseMonth}
            disabled={!calendar || Object.keys(statuses).length === 0}
            title="Clear all entries for this month"
          >
            🗑️ Erase Month
          </button>
        </div>
        <div className="legend">
          {allStatuses.map((status) => (
            <span key={status}>
              <span className={`dot ${statusClass[status]}`} /> {statusLabels[status]}
            </span>
          ))}
        </div>
      </section>

      {calendar && (
        <EmployeeCard
          userId={userId}
          displayName={calendar.user.display_name}
          startDate={calendar.user.start_date as string | null}
          vacationDays={calendar.user.vacation_days ?? []}
          currentYear={year}
          currentMonth={month}
          vacationCounter={vacationCounter}
          remoteCounter={remoteCounter}
        />
      )}

      <section className="card">
        {error && <div className="error-message">{error}</div>}
        {!calendar ? (
          <p>Loading calendar…</p>
        ) : calendar.month.is_locked ? (
          <div className="locked-message">
            <strong>This month is locked.</strong> You cannot edit your schedule.
          </div>
        ) : (
          <>
            <div className="calendar-container">
              <table className="table editable">
                <thead>
                  <tr>
                    <th>Employee</th>
                    {calendar.month.days.map((day) => {
                      const today = new Date().toISOString().split('T')[0];
                      const isToday = day.date === today;
                      const isNonWorking = isNonWorkingDay(day);
                      return (
                        <th key={day.id} className={isToday ? "today-header" : isNonWorking ? "weekend-header" : ""}>
                          {new Date(day.date).getDate()}
                          <div style={{ fontSize: 10 }}>{day.weekday_name}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{calendar.user.display_name}</td>
                    {calendar.month.days.map((day) => {
                      const today = new Date().toISOString().split('T')[0];
                      const status = statuses[day.date];
                      const isSelected = selectedDays.has(day.date);
                      const isNonWorking = isNonWorkingDay(day);
                      const isToday = day.date === today;
                      return (
                        <td
                          key={day.id}
                          className={`${status ? statusClass[status] : "status-empty"} ${isToday ? "today-cell" : isNonWorking ? "weekend-cell" : ""} ${isSelected ? "selected" : ""}`}
                          onClick={(e) => handleDayClick(day.date, isNonWorking, e)}
                        >
                          {status ? statusLabels[status][0] : ""}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>

              <div className="save-section">
                <button
                  className="save-btn"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save Schedule"}
                </button>
                {saved && <div className="save-success">✓ Saved successfully</div>}
              </div>
            </div>

            {selectedDays.size > 0 && pickerPosition && (
              <div 
                className="context-menu" 
                style={{ 
                  position: 'absolute', 
                  top: `${pickerPosition.top}px`, 
                  left: `${pickerPosition.left}px` 
                }}
              >
                <div className="context-menu-header">
                  <div>
                    {selectedDays.size === 1
                      ? `1 day selected`
                      : `${selectedDays.size} days selected`}
                  </div>
                  <button
                    className="close-btn"
                    onClick={() => {
                      setSelectedDays(new Set());
                      setPickerPosition(null);
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className="context-menu-buttons">
                  {allStatuses.map((status) => (
                    <button
                      key={status}
                      className={`context-btn ${statusClass[status]}`}
                      onClick={() => handleStatusSelect(status)}
                      title={statusLabels[status]}
                    >
                      {statusLabels[status][0]}
                    </button>
                  ))}
                  <button
                    className="context-btn clear-btn"
                    onClick={handleClearDays}
                    title="Clear"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
