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
  department_id?: number | null;
  department?: Department | null;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export default function AdminEmployeeManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const getRoleLabel = (role: Role) => {
    return role.charAt(0).toUpperCase() + role.slice(1);
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
                  <th>Remote Limit</th>
                  <th>Start Date</th>
                  <th>Extra Vacation</th>
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
                    <td>{user.annual_remote_limit}</td>
                    <td>
                      {user.start_date
                        ? new Date(user.start_date).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td>{user.additional_vacation_days}</td>
                    <td>
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
