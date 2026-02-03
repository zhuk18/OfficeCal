import { useEffect, useState } from "react";
import CreateUserForm from "./CreateUserForm";

type Role = "employee" | "manager" | "admin";

interface Department {
  id: number;
  name: string;
}

interface User {
  id: number;
  display_name: string;
  email: string;
  role: Role;
  annual_remote_limit: number;
  start_date: string | null;
  additional_vacation_days: number;
  carryover_vacation_days: number;
  department_id?: number | null;
  department?: Department | null;
  vacation_days?: Array<{ vacation_type: string; days_per_year: number }>;
}

interface RemoteCounter {
  year: number;
  used: number;
  limit: number;
  remaining: number;
}

interface VacationCounter {
  year: number;
  allowed: number;
  used: number;
  remaining: number;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export default function AdminEmployeeManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [remoteCounters, setRemoteCounters] = useState<Record<number, RemoteCounter>>({});
  const [vacationCounters, setVacationCounters] = useState<Record<number, VacationCounter>>({});
  const [vacationDatesByUser, setVacationDatesByUser] = useState<Record<number, string[]>>({});
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const controller = new AbortController();

    // Fetch users
    fetch(`${API_URL}/users`, {
      headers: { "X-User-Id": "1" },
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data: User[]) => {
        setUsers(data);
        setLoading(false);
        
        // Fetch remote and vacation counters for each user
        data.forEach((user) => {
          fetch(`${API_URL}/me/remote-counter?year=${currentYear}`, {
            headers: { "X-User-Id": String(user.id) },
            signal: controller.signal,
          })
            .then((res) => res.json())
            .then((counter: RemoteCounter) => {
              setRemoteCounters((prev) => ({ ...prev, [user.id]: counter }));
            })
            .catch(() => {});

          fetch(`${API_URL}/me/vacation-counter?year=${currentYear}`, {
            headers: { "X-User-Id": String(user.id) },
            signal: controller.signal,
          })
            .then((res) => res.json())
            .then((counter: VacationCounter) => {
              setVacationCounters((prev) => ({ ...prev, [user.id]: counter }));
            })
            .catch(() => {});

          fetch(`${API_URL}/users/${user.id}/vacation-dates?year=${currentYear}`, {
            headers: { "X-User-Id": "1" },
            signal: controller.signal,
          })
            .then((res) => res.json())
            .then((dates: string[]) => {
              setVacationDatesByUser((prev) => ({ ...prev, [user.id]: dates }));
            })
            .catch(() => {});
        });
      })
      .catch(() => setLoading(false));

    // Fetch departments
    fetch(`${API_URL}/departments`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: Department[]) => setDepartments(data))
      .catch(() => {});

    return () => controller.abort();
  }, [refreshKey]);

  const filteredUsers = users.filter((user) =>
    user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditClick = (user: User) => {
    setEditingUser(user);
  };

  const handleEditComplete = () => {
    setEditingUser(null);
    setRefreshKey((k) => k + 1);
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Delete ${user.display_name}? This cannot be undone.`)) return;
    try {
      const response = await fetch(`${API_URL}/users/${user.id}`, {
        method: "DELETE",
        headers: { "X-User-Id": "1" },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to delete user:", err);
      alert("Failed to delete user.");
    }
  };

  const getRoleLabel = (role: Role) => {
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const getVacationDates = (user: User) => {
    const rawDates = vacationDatesByUser[user.id] ?? [];
    return rawDates.map((dateStr) => {
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    });
  };

  return (
    <>
      <header className="header">
        <h1>Manage Employees</h1>
      </header>

      <section className="card">
        <div className="filters">
          <input
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <CreateUserForm
            onUserCreated={() => setRefreshKey((k) => k + 1)}
            departments={departments}
          />
        </div>
      </section>

      <section className="card">
        {loading ? (
          <p>Loading employees…</p>
        ) : filteredUsers.length === 0 ? (
          <p>No employees found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Remote (Left/Total)</th>
                  <th>Vacation (Used/Total)</th>
                  <th>Start Date</th>
                  <th>Extra Vacation</th>
                  <th>Carryover Vacation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.display_name}</td>
                    <td>{user.email}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "600",
                          backgroundColor:
                            user.role === "admin"
                              ? "#fee2e2"
                              : user.role === "manager"
                              ? "#fef3c7"
                              : "#dbeafe",
                          color:
                            user.role === "admin"
                              ? "#991b1b"
                              : user.role === "manager"
                              ? "#92400e"
                              : "#1e40af",
                        }}
                      >
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td>{user.department?.name || "—"}</td>
                    <td>
                      {remoteCounters[user.id]
                        ? `${remoteCounters[user.id].remaining} / ${remoteCounters[user.id].limit}`
                        : "—"}
                    </td>
                    <td>
                      {(() => {
                        const dates = getVacationDates(user);
                        return (
                          <div className="vacation-tooltip">
                            {vacationCounters[user.id]
                              ? `${vacationCounters[user.id].used} / ${vacationCounters[user.id].allowed}`
                              : "—"}
                            <div className="vacation-tooltip-content">
                              {dates.length > 0 ? (
                                dates.map((date) => <div key={date}>{date}</div>)
                              ) : (
                                <div>—</div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      {user.start_date
                        ? new Date(user.start_date).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td>
                      {user.vacation_days && user.vacation_days.length > 0
                        ? user.vacation_days.map((v) => `${v.vacation_type}: ${v.days_per_year}`).join(", ")
                        : "—"}
                    </td>
                    <td>{user.carryover_vacation_days}</td>
                    <td>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                        <button
                          onClick={() => handleEditClick(user)}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#2563eb",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "600",
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#dc2626",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "600",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingUser && (
        <CreateUserForm
          departments={departments}
          editingUser={editingUser}
          onEditComplete={handleEditComplete}
        />
      )}
    </>
  );
}
