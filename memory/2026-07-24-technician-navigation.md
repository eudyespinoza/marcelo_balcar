# Debug report: acceso a la pantalla tecnica con roles combinados

- **Symptom:** una cuenta que incluia el rol Tecnico junto con roles administrativos no mostraba la pantalla `Mis servicios` en la navegacion.
- **Root cause:** `Layout` solo construia la navegacion tecnica cuando Tecnico era el unico rol de la cuenta.
- **Fix:** la seleccion de enlaces ahora diferencia entre tecnico exclusivo y tecnico con roles combinados. El primero conserva una unica pantalla; el segundo suma `Mis servicios` a sus enlaces administrativos permitidos.
- **Evidence:** las pruebas cubren cuentas con roles combinados, tecnico exclusivo y administrador sin rol tecnico. En Chrome, la cuenta con roles combinados mostro `Mis servicios` y abrio `/tecnico` con el titulo `Servicios asignados`. Pasaron las 7 pruebas de frontend, lint, build PWA y las 18 pruebas de backend; el health check confirmo PostgreSQL operativo.
- **Regression test:** `frontend/src/components/Layout.test.ts`.
- **Related:** la ruta `/tecnico` ya existia y el backend mantiene el alcance de servicios segun el perfil autenticado.
- **Status:** DONE
