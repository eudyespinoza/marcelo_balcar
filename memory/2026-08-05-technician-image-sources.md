# Carga de imágenes del técnico desde cámara, dispositivo y portapapeles

## Síntoma

En la pantalla de cierre del técnico, el único selector de imagen tenía `capture="environment"`. En determinados navegadores móviles eso abría directamente la cámara e impedía elegir imágenes ya guardadas. Tampoco existía una acción para pegar imágenes copiadas.

## Causa raíz

- Cámara y galería compartían un único `input[type=file]` forzado a la cámara.
- El manejador procesaba solamente `files[0]`, por lo que descartaba selecciones múltiples.
- No había manejo del evento `paste` ni lectura de imágenes mediante la API del portapapeles.
- La carga asíncrona no comunicaba correctamente errores parciales.

## Corrección

- Se separaron tres fuentes visibles: **Tomar foto**, **Elegir imágenes** y **Pegar imagen**.
- Solamente el control de cámara conserva `capture="environment"`.
- El selector de galería/archivos usa `multiple` y acepta todas las imágenes seleccionadas.
- Se admiten imágenes copiadas tanto con el botón como con Ctrl+V/Pegar sobre el bloque.
- Se validan tipo de archivo y máximo de 15 MB antes de subir.
- Se muestra estado de carga, resultado parcial y error; el cierre se bloquea mientras suben imágenes.
- La cola offline existente también recibe imágenes elegidas o pegadas.
- En móvil los controles se apilan, mantienen 8 px de separación y 52 px de alto.

## Evidencia

- Prueba de regresión inicialmente roja contra el selector antiguo y luego verde con las tres fuentes.
- `npm run typecheck`: correcto.
- Suite frontend: 20 archivos y 45 pruebas correctas.
- `npm run build`: compilación PWA correcta.
- QA local a 360 x 812 px: sin desborde horizontal; cámara con `capture`, galería sin `capture` y con selección múltiple.
- Prueba real de portapapeles: PNG pegado y respuesta visible `Imagen cargada.`.
- Se eliminaron el servicio, la imagen y la vinculación de técnico creados temporalmente para QA.

## Prueba de regresión

`frontend/src/pages/TechnicianPage.test.tsx` comprueba la presencia de las tres fuentes, la selección múltiple y la conversión de imágenes del portapapeles en archivos subibles, ignorando texto copiado.

## Relación con el incidente anterior

`memory/2026-07-24-service-photo-gallery.md` corrigió la visualización/MIME de fotos ya cargadas. Este cambio resuelve el origen de las imágenes al momento de seleccionarlas y subirlas.

## Estado

DONE — corregido y verificado localmente. Sin despliegue a producción.
