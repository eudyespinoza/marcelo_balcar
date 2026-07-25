const PRELOAD_RECOVERY_KEY = "mb-preload-recovery-at";
const PRELOAD_RECOVERY_WINDOW_MS = 30_000;

export function recoverFromPreloadError(
  event: Pick<Event, "preventDefault">,
  storage: Pick<Storage, "getItem" | "setItem">,
  reload: () => void,
  now = Date.now()
) {
  const previousAttempt = Number(storage.getItem(PRELOAD_RECOVERY_KEY) ?? 0);
  if (previousAttempt && now - previousAttempt < PRELOAD_RECOVERY_WINDOW_MS) return false;

  event.preventDefault();
  storage.setItem(PRELOAD_RECOVERY_KEY, String(now));
  reload();
  return true;
}

export function installPreloadRecovery(target: Window = window) {
  const recover = (event: Event) => recoverFromPreloadError(event, target.sessionStorage, () => target.location.reload());
  target.addEventListener("vite:preloadError", recover);
  return () => target.removeEventListener("vite:preloadError", recover);
}
