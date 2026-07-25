# Debug report: acceso local desde el navegador integrado

- **Symptom:** abrir `localhost:8443` desde la vista web integrada mostraba `Client sent an HTTP request to an HTTPS server`.
- **Root cause:** el proxy local solo exponia TLS en el puerto 8443, mientras que la vista integrada abria el destino con el esquema HTTP. Caddy rechazaba la solicitud antes de servir React o reenviarla a Django.
- **Fix:** se agrego `docker-compose.local.yml`, con un proxy Caddy HTTP exclusivo para desarrollo en `127.0.0.1:8088` y Django en modo local para no forzar redireccion HTTPS ni cookies Secure.
- **Evidence:** antes del cambio, `curl http://localhost:8443/` devolvia HTTP 400 y `curl -k https://localhost:8443/` devolvia HTTP 200. Despues del cambio, el navegador integrado cargo la pantalla `Marcelo Balcar - Operaciones` en `http://localhost:8088/`; el smoke test valido frontend HTTP 200 y PostgreSQL `ok`. Tambien pasaron 18 pruebas de backend, 3 pruebas de frontend y el chequeo TypeScript.
- **Regression test:** `scripts/smoke-local.ps1` comprueba HTTP 200 en el frontend y `status=ok`, `database=postgresql` en el endpoint de salud.
- **Related:** es una deriva de configuracion entre el proxy HTTPS de produccion y las capacidades del navegador integrado; no era un fallo de React, Django o PostgreSQL.
- **Status:** DONE
