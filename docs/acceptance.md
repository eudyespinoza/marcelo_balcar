# Criterios verificables de aceptación

- El buscador encuentra por nombre con o sin acentos, teléfono, DNI y dirección; PostgreSQL usa `pg_trgm` y `unaccent`.
- Archivar no elimina relaciones y las restauraciones dejan trazabilidad.
- El ciclo permitido es Pendiente → Asignado → En curso → Finalizado; excepciones terminales exigen permiso y motivo.
- Un técnico solo puede operar una orden propia y jamás obtiene campos económicos o sensibles en la respuesta JSON.
- Las operaciones offline se envían por orden, por servicio y con UUID idempotente. Una reasignación/cancelación conserva evidencia y genera conflicto.
- La observación final es obligatoria; las fotos son opcionales y su descarga exige sesión autorizada.
- Los pagos parciales no superan el saldo; las anulaciones exigen motivo y permanecen en caja.
- Reprogramaciones, asignaciones, llegadas, cierres y conflictos aparecen en vivo en menos de dos segundos en la red local objetivo.
- La actualización PWA se posterga cuando hay cola offline o formulario marcado como pendiente.
- Ningún administrador puede darse permisos que no posee, otorgar Superadmin sin ser superusuario ni desactivar/degradar al último Superadmin activo.
- Fecha y hora se presentan como `dd/MM/yyyy HH:mm`, 24 horas, en `America/Argentina/Buenos_Aires`.
- La restauración desde backup externo fue ejecutada y documentada antes del corte.
