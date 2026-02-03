import { useEffect, useState } from "react";

type Role = "employee" | "manager" | "admin";

interface VacationCounter {
  year: number;
  allowed: number;
  used: number;
  remaining: number;
}

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
  department_id: number | null;
  department: Department | null;
  vacation_days?: Array<{ vacation_type: string; days_per_year: number }>;
}

interface Props {
  onUserCreated?: () => void;
  departments: Department[];
  editingUser?: User | null;
  onEditComplete?: () => void;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface VacationDayEntry {
  id: string;
  type: string;
  days: number;
}

export default function CreateUserForm({ onUserCreated, departments, editingUser, onEditComplete }: Props) {
  const [isOpen, setIsOpen] = useState(!!editingUser);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(editingUser?.display_name ?? "");
  const [email, setEmail] = useState(editingUser?.email ?? "");
  const [role, setRole] = useState<Role>(editingUser?.role ?? "employee");
  const [department, setDepartment] = useState(editingUser?.department_id?.toString() ?? "");
  const [annualRemote, setAnnualRemote] = useState(editingUser?.annual_remote_limit ?? 100);
  const [startDate, setStartDate] = useState(editingUser?.start_date ?? "");
  const [additionalVacation, setAdditionalVacation] = useState(editingUser?.additional_vacation_days ?? 0);
  const [carryoverVacation, setCarryoverVacation] = useState(editingUser?.carryover_vacation_days ?? 0);
  const [vacationDays, setVacationDays] = useState<VacationDayEntry[]>([
    { id: "vacation-0", type: "Health", days: 4 },
    { id: "vacation-1", type: "Child", days: 4 },
  ]);
  const [nextId, setNextId] = useState(2);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [remainingVacationPreviousYear, setRemainingVacationPreviousYear] = useState<number | null>(null);
  const [loadingRemaining, setLoadingRemaining] = useState(false);

  const isEditing = !!editingUser;

  // Update form when editingUser changes
  useEffect(() => {
    if (editingUser) {
      setName(editingUser.display_name);
      setEmail(editingUser.email);
      setRole(editingUser.role);
      setDepartment(editingUser.department_id?.toString() ?? "");
      setAnnualRemote(editingUser.annual_remote_limit);
      setStartDate(editingUser.start_date ?? "");
      setAdditionalVacation(editingUser.additional_vacation_days);
      setCarryoverVacation(editingUser.carryover_vacation_days);
      
      // Set vacation days from editingUser
      if (editingUser.vacation_days && editingUser.vacation_days.length > 0) {
        const newVacationDays = editingUser.vacation_days.map((item, i) => ({
          id: `vacation-${i}`,
          type: item.vacation_type,
          days: item.days_per_year,
        }));
        setVacationDays(newVacationDays);
        setNextId(editingUser.vacation_days.length);
      } else {
        setVacationDays([
          { id: "vacation-0", type: "Health", days: 4 },
          { id: "vacation-1", type: "Child", days: 4 },
        ]);
        setNextId(2);
      }
    }
  }, [editingUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Filter out empty vacation types
      const validVacationDays = vacationDays.filter(item => item.type.trim() !== "");
      
      const payload = {
        display_name: name,
        email,
        role,
        annual_remote_limit: annualRemote,
        start_date: startDate || null,
        additional_vacation_days: additionalVacation,
        carryover_vacation_days: carryoverVacation,
        department_id: department ? Number(department) : null,
        vacation_days: validVacationDays.reduce((acc, item) => ({ ...acc, [item.type]: item.days }), {}),
      };

      const url = isEditing ? `${API_URL}/users/${editingUser.id}` : `${API_URL}/users`;
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          "X-User-Id": "1"  // Always use admin user ID for authorization
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errorMessage = `Failed to ${isEditing ? "update" : "create"} user`;
        try {
          const data = await res.json();
          errorMessage = data.detail || data.message || JSON.stringify(data);
        } catch (e) {
          errorMessage = `HTTP ${res.status}: ${res.statusText}`;
        }
        throw new Error(errorMessage);
      }

      setSuccess(`User "${name}" ${isEditing ? "updated" : "created"} successfully!`);
      setName("");
      setEmail("");
      setRole("employee");
      setDepartment("");
      setAnnualRemote(100);
      setStartDate("");
      setAdditionalVacation(0);
      setVacationDays([
        { id: "vacation-0", type: "Health", days: 4 },
        { id: "vacation-1", type: "Child", days: 4 },
      ]);
      setNextId(2);
      
      setTimeout(() => {
        setIsOpen(false);
        setSuccess("");
        onUserCreated?.();
        onEditComplete?.();
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error details:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRemainingVacationFromPreviousYear = async () => {
    if (!editingUser) {
      setError("Can only fetch remaining vacation days for existing employees");
      return;
    }

    setLoadingRemaining(true);
    setError("");

    try {
      const currentYear = new Date().getFullYear();
      const previousYear = currentYear - 1;
      
      const res = await fetch(
        `${API_URL}/me/vacation-counter?year=${previousYear}`,
        {
          headers: { "X-User-Id": String(editingUser.id) },
        }
      );

      if (!res.ok) {
        throw new Error("Failed to fetch vacation data for previous year");
      }

      const data: VacationCounter = await res.json();
      setRemainingVacationPreviousYear(data.remaining);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch remaining vacation days");
      setRemainingVacationPreviousYear(null);
    } finally {
      setLoadingRemaining(false);
    }
  };

  const applyRemainingAsCarryover = () => {
    if (remainingVacationPreviousYear !== null) {
      setCarryoverVacation(remainingVacationPreviousYear);
      setSuccess(`Applied ${remainingVacationPreviousYear} remaining days as carryover`);
      setTimeout(() => setSuccess(""), 3000);
    }
  };

  if (!isOpen && !isEditing) {
    return (
      <button className="add-user-btn" onClick={() => setIsOpen(true)}>
        + Add User
      </button>
    );
  }

  return (
    <div className="modal-overlay" onClick={() => !isEditing && setIsOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditing ? "Edit User" : "Create New User"}</h3>
          <button className="close-btn" onClick={() => {
            setIsOpen(false);
            if (isEditing) {
              onEditComplete?.();
            }
          }}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form">
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <div className="form-group">
            <label>Display Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
            />
          </div>

          <div className="form-group">
            <label>Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
            />
          </div>

          <div className="form-group">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="form-group">
            <label>Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">None</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Annual Remote Days</label>
            <input
              type="number"
              min="0"
              value={annualRemote}
              onChange={(e) => setAnnualRemote(Number(e.target.value))}
            />
          </div>

          <div className="form-group">
            <label>Start Date (Contract)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Vacation Day Types & Limits</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {vacationDays.map((entry) => (
                <div key={entry.id} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="text"
                    value={entry.type}
                    onChange={(e) => {
                      setVacationDays(
                        vacationDays.map((item) =>
                          item.id === entry.id ? { ...item, type: e.target.value } : item
                        )
                      );
                    }}
                    placeholder="Vacation Type (e.g., Health, Child)"
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    min="0"
                    value={entry.days}
                    onChange={(e) => {
                      setVacationDays(
                        vacationDays.map((item) =>
                          item.id === entry.id ? { ...item, days: Number(e.target.value) } : item
                        )
                      );
                    }}
                    placeholder="Days per year"
                    style={{ width: "100px" }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setVacationDays(vacationDays.filter((item) => item.id !== entry.id));
                    }}
                    style={{
                      padding: "6px 10px",
                      backgroundColor: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setVacationDays([
                    ...vacationDays,
                    { id: `vacation-${nextId}`, type: "", days: 0 },
                  ]);
                  setNextId(nextId + 1);
                }}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "600",
                  marginTop: "4px",
                }}
              >
                + Add Vacation Type
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Carryover Vacation Days (Unused from Previous Year)</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <input
                type="number"
                min="0"
                value={carryoverVacation}
                onChange={(e) => setCarryoverVacation(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              {isEditing && (
                <button
                  type="button"
                  onClick={fetchRemainingVacationFromPreviousYear}
                  disabled={loadingRemaining}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "#10b981",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: loadingRemaining ? "not-allowed" : "pointer",
                    fontSize: "12px",
                    fontWeight: "600",
                    whiteSpace: "nowrap",
                  }}
                >
                  {loadingRemaining ? "Loading..." : "Check Previous Year"}
                </button>
              )}
            </div>
            {remainingVacationPreviousYear !== null && (
              <div style={{ marginTop: "8px", fontSize: "13px", color: "#059669" }}>
                ✓ Remaining days from previous year: <strong>{remainingVacationPreviousYear}</strong>
                <button
                  type="button"
                  onClick={applyRemainingAsCarryover}
                  style={{
                    marginLeft: "8px",
                    padding: "4px 8px",
                    backgroundColor: "#10b981",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: "600",
                  }}
                >
                  Apply as Carryover
                </button>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsOpen(false)}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? (isEditing ? "Updating..." : "Creating...") : (isEditing ? "Update User" : "Create User")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
