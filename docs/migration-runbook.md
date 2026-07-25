# Runbook de migración y corte

## Ensayos 1 y 2

1. Exportar nuevamente las tablas de Glide dentro de `Data/`, sin renombrar columnas ni archivos.
2. Obtener snapshot de PostgreSQL y del volumen de medios.
3. Ejecutar `import_legacy --mode precutover --dry-run --skip-media` y revisar el JSON.
4. Ejecutar el ensayo aplicado con descarga de medios.
5. Repetir exactamente la importación; los conteos de filas finales no deben aumentar.
6. Revisar en la pantalla Incidencias las asignaciones antiguas, faltantes y huérfanos.
7. Verificar muestras aleatorias de clientes, direcciones, servicios, horas y fotos.

Aceptación esperada:

| Control | Resultado |
| --- | ---: |
| Clientes importados | 558 |
| Clientes marcados por teléfono duplicado | 10 |
| Direcciones operativas | 584 |
| Direcciones huérfanas | 8 |
| Servicios operativos | 1.204 |
| Servicios con cliente inexistente | 2 |
| Cascarones vacíos omitidos | 29 |
| Asignaciones antiguas a revisar | 4 |
| Referencias históricas de fotos | 267 |

La referencia de foto perteneciente a un servicio huérfano se contabiliza en la cuarentena, no como foto operativa. Los valores históricos con sufijo `Z` conservan además el valor fuente; la aplicación mantiene la hora de pared que mostraba Glide y muestra los tiempos nuevos en `America/Argentina/Buenos_Aires`.

## Corte final (ventana máxima: dos horas)

1. Comunicar el inicio y colocar Glide en solo lectura.
2. Realizar snapshot completo de la VPS, `pg_dump` y medios.
3. Exportar los CSV definitivos y conservar una copia inmutable con checksum.
4. Ejecutar el modo `final` y archivar el reporte JSON.
5. Conciliar todos los conteos de la tabla anterior y revisar las incidencias esperadas.
6. Activar y vincular manualmente los tres perfiles técnicos confirmados. No activar perfiles por importación.
7. Crear/validar cuentas, roles y contraseñas temporales.
8. Ejecutar el recorrido de humo: login, búsqueda, tablero, agenda, asignación, llegada, foto, cierre y pago.
9. Abrir la nueva aplicación. Mantener Glide en solo lectura hasta firmar la validación.

Si falla una conciliación, no se abre la aplicación: restaurar el snapshot o corregir el importador, volver a exportar y repetir. Nunca se corrigen manualmente cientos de filas en producción.
