# Debug report · Configuración y botón de WhatsApp

- **Fecha:** 2026-07-24
- **Síntoma:** la pantalla de configuración y el botón de WhatsApp no aparecían en la aplicación visible en `127.0.0.1:8088`.
- **Causa raíz:** la primera implementación se realizó en un repositorio vacío de OneDrive, mientras la aplicación y los contenedores reales usan `D:\Marcelo Balcar`. Después del despliegue correcto, Chrome mantuvo temporalmente el bundle anterior mediante el service worker de la PWA.
- **Corrección:** se implementó la configuración persistente en Django, su permiso y migración, la ruta de configuración en React, y enlaces `wa.me` junto al teléfono en el directorio y la ficha de cada cliente. Se reconstruyeron `web`, `worker` y `proxy-local`; la migración `0007_applicationsettings` quedó aplicada.
- **Evidencia:** `web` saludable, `/api/v1/health/` responde 200, el bundle servido es `index-DQ2cWXMz.js`, la navegación muestra Configuración y el directorio expone enlaces con el mensaje base codificado.
- **Pruebas de regresión:** `backend/operations/tests/test_security_and_api.py`, `frontend/src/lib/whatsapp.test.ts` y `frontend/src/components/Layout.test.ts`.
- **Resultados:** 22 pruebas backend y 17 pruebas frontend aprobadas; build de producción aprobado; sin errores de consola en la verificación del bundle nuevo.
- **Estado:** DONE.
