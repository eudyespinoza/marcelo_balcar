# Error al guardar fotos grandes desde el dispositivo

## Síntoma

El usuario recibía un error al guardar evidencia fotográfica desde el dispositivo. En producción se registraron tres respuestas HTTP 500 consecutivas al subir fotos a `/api/v1/services/{id}/photos/`. Los servicios sí pudieron finalizarse después de cada fallo.

## Causa raíz

El endpoint anidado ejecutaba `request.data.copy()` para agregar el identificador del servicio. En solicitudes multipart, Django implementa esa copia como una copia profunda. Las fotos reales que superan el umbral de memoria llegan como `TemporaryUploadedFile`, cuyo archivo abierto usa `BufferedRandom` y no puede copiarse ni serializarse. El resultado era `TypeError: cannot pickle 'BufferedRandom' instances` antes de validar o guardar la imagen.

La prueba previa con un PNG mínimo del portapapeles no detectó el problema porque ese archivo permanecía en memoria como `InMemoryUploadedFile`.

## Corrección

El endpoint ahora construye un diccionario superficial con `dict(request.data.items())`. Esto permite agregar el servicio sin copiar el objeto de archivo temporal.

## Evidencia

- Los registros productivos mostraron tres HTTP 500 con el mismo `TypeError` en cargas de fotos y HTTP 200 posteriores al finalizar los servicios.
- La prueba de regresión, forzando `FILE_UPLOAD_MAX_MEMORY_SIZE = 1`, reprodujo inicialmente el error en `request.data.copy()`.
- Con la corrección, la misma solicitud devuelve HTTP 201, el PNG existe en el almacenamiento y el checksum SHA-256 tiene 64 caracteres.
- Suite backend completa: 35 pruebas aprobadas.
- `manage.py check`: sin errores.
- `makemigrations --check --dry-run`: sin cambios pendientes.

## Prueba de regresión

`backend/operations/tests/test_security_and_api.py::test_nested_photo_upload_accepts_files_spooled_to_disk`

## Relacionado

- `memory/2026-07-24-service-photo-gallery.md`: visualización y MIME de fotos guardadas.
- `memory/2026-08-05-technician-image-sources.md`: selección desde cámara, dispositivo y portapapeles.

## Estado

DONE — causa confirmada y corregida localmente. Pendiente de despliegue a producción.
