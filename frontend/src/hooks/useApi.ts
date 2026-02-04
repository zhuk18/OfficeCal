/**
 * Custom React hooks for data fetching and state management
 */

import { useEffect, useState, useCallback } from "react";
import { api } from "../utils/api";
import type { User, Department, TeamCalendar } from "../types";

/**
 * Hook for fetching current user
 */
export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchUser = async () => {
      try {
        const users = await api.users.list();
        if (!mounted) return;

        const adminUser = users.find((u: User) => u.role === "admin");
        const currentUser = adminUser || users[0];

        if (currentUser) {
          // Ensure admin role if it's the first user
          if (!adminUser) {
            setUser({ ...currentUser, role: "admin" });
          } else {
            setUser(currentUser);
          }
        }
      } catch (err) {
        if (!mounted) return;
        console.error("Failed to fetch user:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        // Set default user on error
        setUser({
          id: 1,
          display_name: "Employee",
          email: "",
          role: "employee",
          annual_remote_limit: 100,
          start_date: null,
          additional_vacation_days: 0,
          carryover_vacation_days: 0,
          department_id: null,
          department: null,
        });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchUser();

    return () => {
      mounted = false;
    };
  }, []);

  return { user, loading, error };
}

/**
 * Hook for fetching and managing users
 */
export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchUsers = async () => {
      try {
        setLoading(true);
        const data = await api.users.list();
        if (mounted) {
          setUsers(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          console.error("Failed to fetch users:", err);
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchUsers();

    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  return { users, loading, error, refresh };
}

/**
 * Hook for fetching departments
 */
export function useDepartments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchDepartments = async () => {
      try {
        const data = await api.departments.list();
        if (mounted) {
          setDepartments(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          console.error("Failed to fetch departments:", err);
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchDepartments();

    return () => {
      mounted = false;
    };
  }, []);

  return { departments, loading, error };
}

/**
 * Hook for fetching team calendar
 */
export function useTeamCalendar(year: number, month: number) {
  const [calendar, setCalendar] = useState<TeamCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const fetchCalendar = async () => {
      try {
        setLoading(true);
        const data = await api.calendar.getTeamCalendar(year, month);
        if (mounted) {
          setCalendar(data);
          setError(null);
        }
      } catch (err) {
        if (mounted && !controller.signal.aborted) {
          console.error("Failed to fetch calendar:", err);
          setError(err instanceof Error ? err.message : "Unknown error");
          setCalendar(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchCalendar();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [year, month, refreshKey]);

  return { calendar, loading, error, refresh };
}
