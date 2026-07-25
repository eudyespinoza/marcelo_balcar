export type ServiceStatus = "PENDING" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface User {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  must_change_password: boolean;
  roles: string[];
  permissions: string[];
  is_technician: boolean;
}

export interface Session { user: User; vapid_public_key: string }

export interface ApplicationSettings {
  base_message: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
  dni?: string;
  is_delinquent?: boolean;
  condition?: string;
  legacy_duplicate_allowed?: boolean;
  legacy_locked?: boolean;
  archived_at?: string | null;
  addresses_count: number;
  services_count: number;
}

export interface Address {
  id: string;
  client: string;
  client_name: string;
  full_text: string;
  reference: string;
  legacy_locked: boolean;
  archived_at?: string | null;
}

export interface Technician {
  id: string;
  display_name: string;
  active: boolean;
  user: string | null;
  username?: string;
}

export interface ServiceEvent {
  id: string;
  kind: string;
  kind_label: string;
  actor_name: string;
  occurred_at: string;
  reason: string;
}

export interface ServicePhoto { id: string; image_url: string; caption: string; captured_at: string }

export interface Payment {
  id: string;
  service: string;
  amount: string;
  method: string;
  method_name: string;
  paid_at: string;
  note: string;
  recorded_by_name: string;
  voided_at: string | null;
  void_reason: string;
}

export interface Service {
  id: string;
  client: string;
  client_name: string;
  client_phone: string;
  address: string | null;
  address_text?: string;
  address_snapshot: string;
  scheduled_at: string | null;
  scheduled_duration_minutes: number;
  description: string;
  admin_notes?: string;
  assigned_technician: string | null;
  technician_name?: string;
  status: ServiceStatus;
  status_label: string;
  arrival_at: string | null;
  completion_notes: string;
  completed_at: string | null;
  amount_due?: string | null;
  paid_amount?: string;
  balance?: string | null;
  payment_status?: string;
  actual_duration_minutes: number | null;
  version: number;
  requires_review: boolean;
  legacy_locked?: boolean;
  archived_at?: string | null;
  events?: ServiceEvent[];
  photos?: ServicePhoto[];
  payments?: Payment[];
}

export interface DashboardData {
  date: string;
  range: { start: string; end: string; granularity: "day" | "month" };
  counts: Record<ServiceStatus | "UNASSIGNED" | "REVIEW", number>;
  services: Service[];
  overview: {
    clients_total: number;
    delinquent_clients: number;
    active_users: number;
    active_technicians: number;
    services_total: number;
    unassigned_services: number;
    unscheduled_services: number;
    completion_rate: number;
  };
  finance: null | {
    billed_total: string;
    collected_total: string;
    outstanding_total: string;
    delinquent_balance: string;
    collection_rate: number;
    collected_this_month: string;
  };
  service_trend: Array<{ date: string; scheduled: number; completed: number; cancelled: number }>;
  revenue_trend: Array<{ date: string; collected: string }>;
  status_breakdown: Array<{ status: ServiceStatus; label: string; count: number }>;
  technician_workload: Array<{ id: string; name: string; total: number; completed: number; open: number }>;
  payment_methods: Array<{ name: string; total: string; count: number }>;
}

export interface Paginated<T> { count: number; next: string | null; previous: string | null; results: T[] }

export interface CashReport {
  date: string;
  total: number;
  voided_total: number;
  by_method: Array<{ method__name: string; total: string; movements: number }>;
  payments: Payment[];
}

export interface Role {
  id: number;
  name: string;
  users_count: number;
  permissions: Permission[];
}

export interface Permission { id: number; codename: string; name: string; app: string; model: string }

export interface DataIssue {
  id: string;
  source: string;
  row_reference: string;
  issue_type: string;
  description: string;
  created_at: string;
}

export interface SyncConflict {
  id: string;
  service: string;
  service_description: string;
  reason: string;
  evidence: Record<string, unknown>;
  created_at: string;
}
