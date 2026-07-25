/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkOnly, StaleWhileRevalidate } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

registerRoute(({ request, url }) => request.method === "GET" && url.pathname.startsWith("/media/"), new StaleWhileRevalidate({ cacheName: "service-media" }));
registerRoute(({ request, url }) => request.method !== "GET" && url.pathname.startsWith("/api/"), new NetworkOnly());

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(data.title ?? "Marcelo Balcar", {
    body: data.body ?? "Hay una novedad en operaciones.",
    icon: "/icon.svg", badge: "/icon.svg", data: { url: data.url ?? "/tecnico" },
    tag: data.tag ?? "operations-update"
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? "/"));
});
