from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction


def publish_service_change(service, event_type):
    payload = {
        "type": "service.change",
        "event": event_type,
        "service_id": str(service.id),
        "status": service.status,
        "version": service.version,
        "scheduled_at": service.scheduled_at.isoformat() if service.scheduled_at else None,
        "technician_id": str(service.assigned_technician_id) if service.assigned_technician_id else None,
    }

    def send():
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)("operations", payload)

    transaction.on_commit(send)

