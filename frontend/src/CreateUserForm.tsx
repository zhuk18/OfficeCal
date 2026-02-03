import { useState } from "react";

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
  department_id: number | null;
  department: Department | null;
}

interface Props {
  onUserCreated?: () => void;
  departments: Department[];
  editingUser?: User | null;
  onEditComplete?: () => void;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

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
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isEditing = !!editingUser;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        display_name: name,
        email,
        role,
        annual_remote_limit: annualRemote,
        start_date: startDate || null,
        additional_vacation_days: additionalVacation,
        department_id: department ? Number(department) : null,
      };

      const url = isEditing ? `${API_URL}/users/${editingUser.id}` : `${API_URL}/users`;
      const method = isEditing ? "PUT" : "POST";
      const headerValue = isEditing ? "X-User-Id" : "Content-Type";
      const headerKey = isEditing ? editingUser.id.toString() : "application/json";

      const res = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          "X-User-Id": String(editingUser?.id || "")
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || `Failed to ${isEditing ? "update" : "create"} user`);
      }

      setSuccess(`User "${name}" ${isEditing ? "updated" : "created"} successfully!`);
      setName("");
      setEmail("");
      setRole("employee");
      setDepartment("");
      setAnnualRemote(100);
      setStartDate("");
      setAdditionalVacation(0);
      
      setTimeout(() => {
        setIsOpen(false);
        setSuccess("");
        onUserCreated?.();
        onEditComplete?.();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
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
            <label>Additional Vacation Days</label>
            <input
              type="number"
              min="0"
              value={additionalVacation}
              onChange={(e) => setAdditionalVacation(Number(e.target.value))}
            />
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
