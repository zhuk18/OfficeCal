/**
 * API client utilities with error handling
 */

import { API_URL } from "../config/constants";

interface RequestOptions extends RequestInit {
  userId?: number;
}

/**
 * Generic fetch wrapper with error handling
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { userId, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);
  if (userId) {
    headers.set("X-User-Id", String(userId));
  }
  if (fetchOptions.body && typeof fetchOptions.body === "object") {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(
      `API Error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  // Handle empty responses
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }

  return {} as T;
}

/**
 * Specialized API methods
 */
export const api = {
  users: {
    list: () => apiFetch<any[]>("/users", { userId: 1 }),
    get: (userId: number) => apiFetch<any>(`/users/${userId}`, { userId: 1 }),
    create: (data: any) =>
      apiFetch<any>("/users", {
        method: "POST",
        body: JSON.stringify(data),
        userId: 1,
      }),
    update: (userId: number, data: any) =>
      apiFetch<any>(`/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify(data),
        userId: 1,
      }),
    delete: (userId: number) =>
      apiFetch<any>(`/users/${userId}`, {
        method: "DELETE",
        userId: 1,
      }),
  },

  departments: {
    list: () => apiFetch<any[]>("/departments"),
  },

  calendar: {
    getMonth: (year: number, month: number) =>
      apiFetch<any>(`/months/${year}/${month}`),
    getTeamCalendar: (year: number, month: number) =>
      apiFetch<any>(`/calendar/${year}/${month}`),
    getUserCalendar: (userId: number, year: number, month: number) =>
      apiFetch<any>(`/users/${userId}/calendar/${year}/${month}`, {
        userId: 1,
      }),
    updateUserCalendar: (
      userId: number,
      year: number,
      month: number,
      data: any
    ) =>
      apiFetch<any>(`/users/${userId}/calendar/${year}/${month}`, {
        method: "PUT",
        body: JSON.stringify(data),
        userId: 1,
      }),
  },

  counters: {
    remote: (userId: number, year: number) =>
      apiFetch<any>(`/me/remote-counter?year=${year}`, { userId }),
    vacation: (userId: number, year: number) =>
      apiFetch<any>(`/me/vacation-counter?year=${year}`, { userId }),
    vacationDates: (userId: number, year: number) =>
      apiFetch<string[]>(`/users/${userId}/vacation-dates?year=${year}`, {
        userId: 1,
      }),
  },
};
