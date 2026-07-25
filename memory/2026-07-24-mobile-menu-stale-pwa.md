# Menú móvil sin reacción por recursos PWA desactualizados

## Estado

DONE — corregido, probado y desplegado el 24/07/2026.

## Síntoma

En una PWA que había permanecido abierta después de un despliegue, el panel **Más secciones** se abría, pero al tocar enlaces como Caja, Incidencias, Seguridad o Configuración la navegación parecía no reaccionar.

## Causa raíz

Las rutas del frontend se cargan de forma diferida. La instancia abierta conservaba referencias a archivos JavaScript con hash de una versión anterior. Después del despliegue, esas URLs ya no existían y el fallback de la SPA devolvía `index.html` con tipo `text/html` en lugar del módulo JavaScript solicitado. Vite emitía `vite:preloadError`, pero la aplicación no tenía ningún mecanismo de recuperación, por lo que el clic terminaba en un error de carga silencioso para el usuario.

Evidencia observada:

- Un chunk anterior de Caja devolvía HTTP 200 con `text/html` y el HTML de la SPA.
- El chunk vigente devolvía `text/javascript`.
- En una sesión fresca, los mismos `NavLink` del menú funcionaban correctamente, descartando un problema de superposición, permisos o eventos del botón.

## Corrección

- Se agregó un manejador global para `vite:preloadError`.
- Ante el primer error, se cancela la propagación del fallo y se recarga la aplicación para obtener el manifiesto y los chunks vigentes.
- Se guarda el intento en `sessionStorage` y se aplica una ventana de 30 segundos para evitar ciclos de recarga si el servidor continuara entregando recursos inválidos.

Archivos principales:

- `frontend/src/lib/preloadRecovery.ts`
- `frontend/src/lib/preloadRecovery.test.ts`
- `frontend/src/main.tsx`

## Verificación

- `npm run typecheck`: aprobado.
- `npx vitest run --pool=threads --maxWorkers=1`: 8 archivos, 22 pruebas aprobadas.
- `npm run build`: aprobado; PWA generada correctamente.
- Aplicación desplegada: `/` HTTP 200 y `/api/v1/health/` HTTP 200.
- Bundle servido contiene el manejador `vite:preloadError` y la clave de protección contra recargas repetidas.
- Prueba real en vista móvil después del despliegue: abrir **Más**, tocar **Caja**, navegar a `/caja`, mostrar **Caja diaria** y registrar cero errores de consola.

## Prueba de regresión

`frontend/src/lib/preloadRecovery.test.ts` comprueba que el primer error de precarga provoca una única recarga y que un segundo error dentro de la ventana de seguridad no genera un bucle.
