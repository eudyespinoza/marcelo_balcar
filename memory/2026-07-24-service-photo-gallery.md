# Debug report: fotos de servicios no visibles

- **Symptom:** las imágenes cargadas por el técnico quedaban guardadas, pero no aparecían al abrir el detalle del servicio.
- **Root cause:** `ServiceDetailSerializer` ya incluía `photos`, pero `ServicePanel` nunca renderizaba ese campo. Además, el endpoint autenticado entregaba todos los archivos como `application/octet-stream` en vez de su tipo de imagen real.
- **Fix:** se agregó una galería de evidencia fotográfica al detalle del servicio, con miniaturas, fecha y enlace a la imagen completa. El endpoint protegido ahora determina el MIME a partir del nombre del archivo.
- **Evidence:** se confirmó que la foto real `3857674b-7976-4518-a787-9e9e20856b6b` existe en `media_data`. En Chrome, el servicio `57fc74a4-c37d-4e46-9050-d7dd248dbc13` mostró una miniatura cargada completamente con dimensiones naturales de 1024×1024 y sin errores de consola.
- **Regression tests:** `frontend/src/components/ServicePanel.test.tsx` valida que la galería genere la imagen y el enlace autenticado; `backend/operations/tests/test_security_and_api.py` valida que el endpoint entregue `image/png`.
- **Test results:** frontend: 7 archivos, 21 pruebas aprobadas. Backend: 24 aprobadas y 2 omitidas. Health check: HTTP 200 con PostgreSQL operativo.
- **Status:** DONE
