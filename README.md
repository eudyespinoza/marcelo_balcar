# Marcelo Balcar · Centro de operaciones

PWA para administrar clientes, domicilios, servicios técnicos, agenda, ejecución móvil, cobranza, caja y permisos. El sistema usa Django 5.2 LTS, React/TypeScript, PostgreSQL 17, Redis/Channels, Celery y Caddy.

## Puesta en marcha local

Requisitos: Python 3.13, Node 22 y Docker Desktop (para PostgreSQL/Redis o para ejecutar todo el stack).

1. Copiar `.env.example` a `.env` y reemplazar todos los valores `change-me`.
2. Para ejecutar todo con contenedores:

   ```powershell
   docker compose up --build -d
   docker compose ps
   ```

3. Abrir `https://localhost` (Caddy puede solicitar aceptar su certificado local). La cuenta inicial se toma de `BOOTSTRAP_ADMIN_USERNAME` y `BOOTSTRAP_ADMIN_PASSWORD`; obliga a cambiar la clave en el primer ingreso. Reiniciar los contenedores no vuelve a cambiar esa contraseña.

Para desarrollo sin reconstruir contenedores:

```powershell
.\.venv\Scripts\python backend\manage.py runserver 8000
cd frontend
npm run dev
```

La configuración de desarrollo usa SQLite e in-memory Channels si no se define `DATABASE_URL`/`REDIS_URL`. Producción siempre usa PostgreSQL y Redis.

## Migración desde Glide

`Data/` se excluye de Git y se monta en modo solo lectura dentro del importador. Los ensayos son idempotentes y dejan los registros heredados bloqueados:

```powershell
docker compose --profile migration run --rm importer python manage.py import_legacy --source /legacy --mode precutover --dry-run --skip-media --report-dir /app/reports
docker compose --profile migration run --rm importer
```

Para el corte final, con Glide ya en solo lectura:

```powershell
docker compose --profile migration run --rm importer python manage.py import_legacy --source /legacy --mode final --report-dir /app/reports
```

Los reportes JSON se guardan en `var/reports/`. Deben conciliar 558 clientes, 584 direcciones, 1.204 servicios operativos, 267 referencias de fotos y 4 asignaciones antiguas; las 8 direcciones y 2 servicios huérfanos quedan como incidencias. Ver [runbook de migración](docs/migration-runbook.md).

## Pruebas y contratos

```powershell
cd backend
..\.venv\Scripts\python -m pytest
..\.venv\Scripts\python manage.py check
cd ..\frontend
npm test
npm run lint
npm run build
```

El contrato versionado se genera con:

```powershell
cd backend
..\.venv\Scripts\python manage.py spectacular --file openapi.yaml --validate
```

Endpoints de salud: `/api/v1/health/`. WebSocket autenticado: `/ws/operations` (solo estado, versión e identificador; sin datos personales).

## Producción

- Definir un dominio real en `DOMAIN`, incluirlo en `DJANGO_ALLOWED_HOSTS` y colocar `https://dominio` en `DJANGO_CSRF_TRUSTED_ORIGINS`.
- Usar secretos aleatorios independientes para Django, PostgreSQL, bootstrap, VAPID y restic.
- Crear claves VAPID y completar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` para habilitar avisos opt-in.
- Habilitar el firewall solo para SSH, 80 y 443; Caddy emite y renueva HTTPS.
- Mantener los volúmenes `postgres_data`, `media_data`, `redis_data`, `static_data` y `caddy_data` fuera del ciclo de reemplazo de contenedores.

### Acceso temporal por IP en devlink

Cuando Traefik ya ocupa los puertos 80 y 443, definir `DEVLINK_IP_ADDRESS=IP` y
agregar `https://IP` a `DJANGO_CSRF_TRUSTED_ORIGINS`. Levantar con:

```bash
docker compose -f docker-compose.yml -f docker-compose.devlink.yml up -d
```

Traefik terminará HTTPS en el puerto 443 y enviará el tráfico al Caddy interno.
El navegador debe aceptar el certificado por defecto antes del primer ingreso.
Esta modalidad es transitoria; para producción pública se debe usar un dominio con
certificado confiable.

Backup externo, una vez configurado el repositorio S3-compatible:

```powershell
docker compose --profile backup up -d backup
```

Retención: 7 diarios, 4 semanales y 6 mensuales. El procedimiento de restauración está en [backup y recuperación](docs/backup-restore.md).

## Alcance y privacidad

Los técnicos reciben únicamente clientes vinculados a sus órdenes y nunca reciben DNI, mora, condición, notas administrativas, importes ni pagos. Las fotos se sirven por un endpoint autenticado, no como archivos públicos. Las acciones sensibles se validan en backend, se auditan y respetan el rol incluso si se invoca la API directamente.

Inventario, ventas, facturación fiscal, gastos, GPS/mapas, portal del cliente, WhatsApp automático y múltiples técnicos por servicio quedan fuera de esta versión.
