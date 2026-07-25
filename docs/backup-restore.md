# Backup, restauración y prueba

El servicio `backup` produce cada 24 horas un `pg_dump` en formato custom y respalda ese dump junto con `/media` usando restic. El repositorio debe ser S3-compatible y externo a la VPS; restic cifra nombres, metadatos y contenido con `BACKUP_PASSWORD`.

## Verificación diaria

```powershell
docker compose --profile backup logs --tail 100 backup
docker compose --profile backup exec backup restic snapshots --tag marcelo-balcar
```

Alertar si no existe un snapshot en las últimas 26 horas. La contraseña y credenciales S3 deben almacenarse además fuera de la VPS.

## Restauración trimestral comprobada

1. Preparar una VPS o entorno aislado, sin conectarlo al dominio productivo.
2. Detener la aplicación aislada y crear volúmenes vacíos.
3. Ejecutar `restic snapshots`, elegir el snapshot y restaurarlo en un directorio temporal.
4. Restaurar el dump:

   ```powershell
   pg_restore --clean --if-exists --no-owner --dbname=marcelo /restore/marcelo-AAAAMMDD-HHMMSS.dump
   ```

5. Copiar el contenido restaurado de `media` al volumen vacío manteniendo permisos.
6. Ejecutar `python manage.py migrate`, `python manage.py check` y el recorrido de humo.
7. Conciliar cantidad de clientes, servicios, pagos y archivos con el origen.
8. Registrar fecha, snapshot, tiempo de recuperación, responsable y resultado.

Una prueba se considera válida solo si la aplicación inicia, una foto autenticada abre, la caja concilia y un servicio puede recorrer asignación, llegada y cierre.
