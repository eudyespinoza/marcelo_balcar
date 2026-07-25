import Dexie, { type EntityTable } from "dexie";
import type { Service } from "../types";
import { api } from "./api";

export type OfflineKind = "ARRIVE" | "ADD_NOTE" | "COMPLETE";

export interface OfflineOperation {
  id: string;
  serviceId: string;
  type: OfflineKind;
  baseVersion: number;
  occurredAt: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface OfflinePhoto {
  id: string;
  serviceId: string;
  blob: Blob;
  name: string;
  caption: string;
  capturedAt: string;
  createdAt: number;
}

class OperationsDatabase extends Dexie {
  services!: EntityTable<Service, "id">;
  outbox!: EntityTable<OfflineOperation, "id">;
  photos!: EntityTable<OfflinePhoto, "id">;

  constructor() {
    super("mb-operations");
    this.version(1).stores({ services: "id,scheduled_at,status,client", outbox: "id,serviceId,createdAt", photos: "id,serviceId,createdAt" });
  }
}

export const offlineDb = new OperationsDatabase();

export async function cacheServices(services: Service[]) {
  await offlineDb.transaction("rw", offlineDb.services, async () => {
    await offlineDb.services.clear();
    await offlineDb.services.bulkPut(services);
  });
}

export async function enqueue(service: Service, type: OfflineKind, payload: Record<string, unknown> = {}) {
  await offlineDb.outbox.add({
    id: crypto.randomUUID(), serviceId: service.id, type, baseVersion: service.version,
    occurredAt: new Date().toISOString(), payload, createdAt: Date.now()
  });
  window.dispatchEvent(new Event("mb-outbox-change"));
}

export async function enqueuePhoto(serviceId: string, file: File, caption = "") {
  await offlineDb.photos.add({
    id: crypto.randomUUID(), serviceId, blob: file, name: file.name, caption,
    capturedAt: new Date().toISOString(), createdAt: Date.now()
  });
  window.dispatchEvent(new Event("mb-outbox-change"));
}

export async function pendingCount() {
  return (await offlineDb.outbox.count()) + (await offlineDb.photos.count());
}

export async function clearOfflineData() {
  await offlineDb.transaction("rw", offlineDb.services, offlineDb.outbox, offlineDb.photos, async () => {
    await Promise.all([offlineDb.services.clear(), offlineDb.outbox.clear(), offlineDb.photos.clear()]);
  });
}

export async function syncOffline() {
  if (!navigator.onLine) return { applied: 0, conflicts: 0 };
  let applied = 0;
  let conflicts = 0;
  const operations = await offlineDb.outbox.orderBy("createdAt").toArray();
  for (const operation of operations) {
    const response = await api<{ operations: Array<{ operation_id: string; status: "applied" | "duplicate" | "conflict"; result: unknown }> }>("/sync/operations/", {
      method: "POST",
      body: JSON.stringify({ operations: [{
        operation_id: operation.id, service_id: operation.serviceId, type: operation.type,
        base_version: operation.baseVersion, occurred_at: operation.occurredAt, payload: operation.payload
      }] })
    });
    const result = response.operations[0]?.status;
    if (result === "applied" || result === "duplicate") applied += 1;
    if (result === "conflict") conflicts += 1;
    await offlineDb.outbox.delete(operation.id);
  }
  const photos = await offlineDb.photos.orderBy("createdAt").toArray();
  for (const photo of photos) {
    const form = new FormData();
    form.set("service", photo.serviceId);
    form.set("client_operation_id", photo.id);
    form.set("image", new File([photo.blob], photo.name, { type: photo.blob.type }));
    form.set("caption", photo.caption);
    form.set("captured_at", photo.capturedAt);
    await api(`/services/${photo.serviceId}/photos/`, { method: "POST", body: form });
    await offlineDb.photos.delete(photo.id);
    applied += 1;
  }
  window.dispatchEvent(new Event("mb-outbox-change"));
  return { applied, conflicts };
}
