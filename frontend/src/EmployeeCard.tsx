import { useEffect, useState } from "react";

type EmployeeCardProps = {
  userId: number;
  displayName: string;
  startDate: string | null;
  additionalVacationDays: number;
  currentYear: number;
  currentMonth: number;
};

type VacationCounter = {
  year: number;
  allowed: number;
  used: number;
  remaining: number;
};

type RemoteCounter = {
  year: number;
  used: number;
  limit: number;
  remaining: number;
};

export function EmployeeCard({
  userId,
  displayName,
  startDate,
  additionalVacationDays,
  currentYear,
  currentMonth,
}: EmployeeCardProps) {
  const [vacationCounter, setVacationCounter] = useState<VacationCounter | null>(null);
  const [remoteCounter, setRemoteCounter] = useState<RemoteCounter | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

    // Fetch vacation counter
    fetch(`${API_URL}/me/vacation-counter?year=${currentYear}&month=${currentMonth}`, {
      headers: { "X-User-Id": String(userId) },
    })
      .then((res) => res.json())
      .then((data: VacationCounter) => {
        setVacationCounter(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Fetch remote counter
    fetch(`${API_URL}/me/remote-counter?year=${currentYear}`, {
      headers: { "X-User-Id": String(userId) },
    })
      .then((res) => res.json())
      .then((data: RemoteCounter) => setRemoteCounter(data))
      .catch(() => setRemoteCounter(null));
  }, [userId, currentYear, currentMonth]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <section className="employee-card">
      <div className="employee-card-title">{displayName}</div>
      
      <div className="employee-card-grid">
        <div className="employee-card-item">
          <div className="employee-card-label">Start Date</div>
          <div className="employee-card-value">{formatDate(startDate)}</div>
        </div>

        <div className="employee-card-item">
          <div className="employee-card-label">Remote Days(left/assigned)</div>
          <div className="employee-card-value">
            {remoteCounter ? `${remoteCounter.remaining} / ${remoteCounter.limit}` : "—"}
          </div>
        </div>

        <div className="employee-card-item">
          <div className="employee-card-label">Vacation Days {currentYear} (Used/available)</div>
          <div className="employee-card-value">
            {loading ? "—" : `${vacationCounter?.used ?? 0} / ${vacationCounter?.allowed ?? 0}`}
          </div>
        </div>

        <div className="employee-card-item">
          <div className="employee-card-label">Additional Vacation Days</div>
          <div className="employee-card-value">{additionalVacationDays}</div>
        </div>
      </div>
    </section>
  );
}
