# Debug report · Asignación de técnico desde Agenda

- **Fecha:** 2026-07-24
- **Síntoma:** al asignar un técnico a un servicio pendiente y sin técnico desde el detalle de Agenda, la interfaz mostraba `No se pudo completar la operación` y el endpoint `POST /api/v1/services/{id}/assign/` respondía 500.
- **Causa raíz:** `assign_service()` usaba `select_for_update()` junto con `select_related("assigned_technician")`. Como `assigned_technician` es nullable, Django generaba un `LEFT OUTER JOIN` y PostgreSQL rechazaba bloquear el lado nullable con `FOR UPDATE`.
- **Corrección:** se eliminó la unión innecesaria al técnico y se mantuvo `select_for_update()` únicamente sobre la fila de `Service`.
- **Evidencia:** la prueba de regresión reprodujo primero `django.db.utils.NotSupportedError: FOR UPDATE cannot be applied to the nullable side of an outer join`; después del cambio pasó sobre PostgreSQL. En la aplicación desplegada, la orden `57FC74A4` fue asignada a `Eudy Espinoza` desde Agenda y el endpoint respondió 200.
- **Prueba de regresión:** `backend/operations/tests/test_workflow.py::test_assign_unassigned_service`.
- **Resultados:** suite completa de backend aprobada con dos pruebas omitidas; frontend 17/17; contenedores `web` y `worker` reconstruidos; `/api/v1/health/` responde 200 con PostgreSQL.
- **Estado:** DONE.
