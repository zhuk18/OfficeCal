/**
 * Application constants and configuration
 */

import type { DayStatus } from "../types";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const STATUS_LABELS: Record<DayStatus, string> = {
  office: "Office",
  remote: "Remotely",
  vacation: "Vacation",
  night: "Night shift",
  trip: "Business trip",
  absent: "Absent/Other",
};

export const STATUS_CLASSES: Record<DayStatus, string> = {
  office: "status-office",
  remote: "status-remote",
  vacation: "status-vacation",
  night: "status-night",
  trip: "status-trip",
  absent: "status-absent",
};

export const DEFAULT_REMOTE_LIMIT = 100;
