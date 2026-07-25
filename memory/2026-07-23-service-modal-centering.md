# Debug report: centrado del detalle del servicio

- **Symptom:** el modal de detalle aparecia centrado respecto del area a la derecha del menu, no respecto de la pantalla completa.
- **Root cause:** `Modal` se renderizaba dentro de `main`. La animacion de `main` usa `transform`, que crea el bloque de referencia para descendientes con `position: fixed`; ademas `main` tiene el margen de la barra lateral.
- **Fix:** el componente compartido `Modal` ahora usa un portal de React hacia `document.body`, fuera del contenedor transformado.
- **Evidence:** la prueba de regresion monta el modal dentro de un `main` transformado y verifica que el backdrop sea hijo directo de `body`. En Chrome, el modal actualizado quedo con desplazamiento horizontal y vertical de `0 px` respecto de un viewport util de 1905 x 895. Pasaron 4 pruebas frontend, TypeScript, el build PWA y 18 pruebas backend.
- **Regression test:** `frontend/src/components/Modal.test.tsx`.
- **Related:** afecta a todos los modales de escritorio; la presentacion inferior en movil se conserva mediante las mismas clases CSS.
- **Status:** DONE
