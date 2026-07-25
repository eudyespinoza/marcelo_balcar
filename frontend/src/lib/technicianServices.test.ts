import { describe, expect, it } from "vitest";
import { groupTechnicianServices } from "./technicianServices";
import type { Service, ServiceStatus } from "../types";

function service(id: string, scheduledAt: string | null, status: ServiceStatus): Service {
  return {
    id,
    client: "client-1",
    client_name: "Cliente",
    client_phone: "",
    address: null,
    address_snapshot: "",
    scheduled_at: scheduledAt,
    scheduled_duration_minutes: 60,
    description: "Servicio",
    assigned_technician: "technician-1",
    status,
    status_label: status,
    arrival_at: null,
    completion_notes: "",
    completed_at: null,
    actual_duration_minutes: null,
    version: 1,
    requires_review: false
  };
}

describe("groupTechnicianServices", () => {
  it("keeps an assigned service with a past date in pending tasks", () => {
    const overdue = service("44a8c4c4-9bb0-40e5-ac88-fa5f943893ba", "2026-07-17T11:00:00Z", "ASSIGNED");

    const grouped = groupTechnicianServices([overdue], "2026-07-25");

    expect(grouped.pending).toEqual([overdue]);
    expect(grouped.today).toEqual([]);
    expect(grouped.upcoming).toEqual([]);
    expect(grouped.history).toEqual([]);
  });

  it("separates today's, future and completed services", () => {
    const today = service("today", "2026-07-25T15:00:00Z", "ASSIGNED");
    const upcoming = service("upcoming", "2026-07-26T15:00:00Z", "PENDING");
    const completed = service("completed", "2026-07-17T11:00:00Z", "COMPLETED");

    const grouped = groupTechnicianServices([today, upcoming, completed], "2026-07-25");

    expect(grouped.today).toEqual([today]);
    expect(grouped.upcoming).toEqual([upcoming]);
    expect(grouped.history).toEqual([completed]);
  });
});
