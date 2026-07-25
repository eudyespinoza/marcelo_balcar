# DEBUG REPORT — PWA install prompt

- **Symptom:** The application works as a PWA but Chrome does not proactively ask the user to install it.
- **Root cause:** The production app has a valid web manifest, service worker, standalone display mode, and install icons, but there is no `beforeinstallprompt` listener or in-app install affordance. `registerType: "prompt"` in `vite-plugin-pwa` controls service-worker update prompts; it does not trigger the browser's PWA installation dialog. Without custom install UI, installation discovery depends on browser-provided UI such as Chrome's address-bar install icon, and a proactive popup is not guaranteed.
- **Fix:** No code change was made because the request was diagnostic. The correct implementation would capture `beforeinstallprompt`, show an “Instalar aplicación” action only while that event is available, call `prompt()` from a user gesture, hide it after `appinstalled`, and provide iOS-specific Add to Home Screen guidance.
- **Evidence:** `/manifest.webmanifest` returned HTTP 200 with `application/manifest+json`; `/sw.js` returned HTTP 200 with JavaScript content; 192px, 512px, and maskable icon resources all returned HTTP 200. A repository-wide search found no `beforeinstallprompt`, `appinstalled`, or install-button implementation.
- **Regression test:** Not applicable until installation UI is implemented. Future tests should cover event capture, button visibility, prompt invocation, dismissal, and installed/standalone suppression.
- **Related:** The existing update toast is specifically for activating a newly deployed service worker and should remain separate from installation UI.
- **Status:** DONE
