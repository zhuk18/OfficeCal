/**
 * Centralized type definitions for the application
 */

export type Role = "employee" | "manager" | "admin";

export type DayStatus =
  | "office"
  | "remote"
  | "vacation"
  | "night"
  | "trip"
  | "absent";

export interface Department {
  id: number;
  name: string;
}

export interface User {
  id: number;
  display_name: string;
  email: string;
  role: Role;
  annual_remote_limit: number;
  start_date: string | null;
  additional_vacation_days: number;
  carryover_vacation_days?: number;
  department_id?: number | null;
  department?: Department | null;
  vacation_days?: VacationDays[];
}

export interface VacationDays {
  vacation_type: string;
  days_per_year: number;
}

export interface CalendarDay {
  id: number;
  date: string;
  weekday_name: string;
  is_weekend: boolean;
  is_holiday: boolean;
  is_workday_override: boolean;
}

export interface CalendarMonth {
  id: number;
  year: number;
  month: number;
  is_locked: boolean;
  days: CalendarDay[];
}

export interface TeamRow {
  user: User;
  statuses: Record<string, DayStatus | null>;
  notes: Record<string, string | null>;
  remote_remaining_start: number;
  remote_remaining_end: number;
}

export interface TeamCalendar {
  month: CalendarMonth;
  rows: TeamRow[];
}

export interface RemoteCounter {
  year: number;
  used: number;
  limit: number;
  remaining: number;
}

export interface VacationCounter {
  year: number;
  allowed: number;
  used: number;
  remaining: number;
}
