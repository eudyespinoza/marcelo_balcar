from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import models, transaction
from django.utils import timezone

from .models import AuditEvent, Payment, Service, ServiceEvent, SyncConflict, SyncOperation, User
from .permissions import can_operate_service, get_technician_profile
from .realtime import publish_service_change


def _queue_push(user_ids, title, body, url):
    ids = [str(user_id) for user_id in user_ids if user_id]
    if not ids:
        return
    from .tasks import send_push

    transaction.on_commit(lambda: send_push.delay(ids, title, body, url))


def _notify_admins(title, body, service):
    users = User.objects.filter(is_active=True).filter(
        models.Q(is_superuser=True) | models.Q(groups__permissions__codename="view_dashboard")
    ).values_list("id", flat=True).distinct()
    _queue_push(users, title, body, f"/?service={service.id}")


def _notify_technician(service, title, body):
    user_id = getattr(service.assigned_technician, "user_id", None) if service.assigned_technician_id else None
    _queue_push([user_id], title, body, f"/tecnico?service={service.id}")


def _event(service, kind, actor, *, reason="", occurred_at=None, payload=None):
    return ServiceEvent.objects.create(
        service=service,
        kind=kind,
        actor=actor,
        reason=reason,
        occurred_at=occurred_at or timezone.now(),
        payload=payload or {},
    )


def _audit(actor, action, instance, metadata=None):
    AuditEvent.objects.create(
        actor=actor,
        action=action,
        object_type=instance.__class__.__name__,
        object_id=str(instance.pk),
        metadata=metadata or {},
    )


def _ensure_unlocked(service):
    if service.legacy_locked:
        raise ValidationError("El servicio importado está bloqueado hasta el corte final.")


def find_overlaps(service, technician, scheduled_at, duration_minutes):
    if not technician or not scheduled_at:
        return []
    end = scheduled_at + timedelta(minutes=duration_minutes)
    start_of_day = scheduled_at.replace(hour=0, minute=0, second=0, microsecond=0)
    candidates = Service.objects.filter(
        assigned_technician=technician,
        archived_at__isnull=True,
        scheduled_at__gte=start_of_day,
        scheduled_at__lt=start_of_day + timedelta(days=1),
    ).exclude(pk=service.pk).exclude(status__in=[Service.Status.CANCELLED, Service.Status.COMPLETED])
    overlaps = []
    for candidate in candidates:
        candidate_end = candidate.scheduled_at + timedelta(minutes=candidate.scheduled_duration_minutes)
        if candidate.scheduled_at < end and candidate_end > scheduled_at:
            overlaps.append(candidate)
    return overlaps


@transaction.atomic
def assign_service(service_id, technician, actor, *, override_overlap=False, reason=""):
    service = Service.objects.select_for_update().get(pk=service_id)
    _ensure_unlocked(service)
    if service.status in [Service.Status.COMPLETED, Service.Status.CANCELLED]:
        raise ValidationError("No se puede asignar un servicio finalizado o cancelado.")
    if service.status == Service.Status.IN_PROGRESS and not reason.strip():
        raise ValidationError("Reasignar un servicio en curso exige un motivo.")
    overlaps = find_overlaps(service, technician, service.scheduled_at, service.scheduled_duration_minutes)
    if overlaps and not override_overlap:
        raise ValidationError({"overlap": [str(item.id) for item in overlaps]})
    previous_id = service.assigned_technician_id
    service.assigned_technician = technician
    if service.status != Service.Status.IN_PROGRESS:
        service.status = Service.Status.ASSIGNED if technician else Service.Status.PENDING
    service.version += 1
    service.updated_by = actor
    service.save()
    kind = ServiceEvent.Kind.REASSIGNED if previous_id else ServiceEvent.Kind.ASSIGNED
    _event(service, kind, actor, reason=reason, payload={"from": str(previous_id or ""), "to": str(technician.id) if technician else None})
    _audit(actor, "service.assign", service)
    publish_service_change(service, "assigned")
    if technician:
        _notify_technician(service, "Servicio asignado", "Tenés una nueva orden de servicio asignada.")
    return service, overlaps


@transaction.atomic
def arrive_service(service_id, actor, *, occurred_at=None):
    service = Service.objects.select_for_update().get(pk=service_id)
    _ensure_unlocked(service)
    if not can_operate_service(actor, service):
        raise PermissionDenied("No puede operar este servicio.")
    if service.status != Service.Status.ASSIGNED:
        raise ValidationError("Solo un servicio asignado puede marcar llegada.")
    service.arrival_at = occurred_at or timezone.now()
    service.status = Service.Status.IN_PROGRESS
    service.version += 1
    service.updated_by = actor
    service.save(update_fields=["arrival_at", "status", "version", "updated_by", "updated_at"])
    _event(service, ServiceEvent.Kind.ARRIVED, actor, occurred_at=service.arrival_at)
    publish_service_change(service, "arrived")
    _notify_admins("Técnico en sitio", f"La orden {str(service.id)[:8]} registró su llegada.", service)
    return service


@transaction.atomic
def add_service_note(service_id, actor, note, *, occurred_at=None):
    note = (note or "").strip()
    if not note:
        raise ValidationError("La observación no puede estar vacía.")
    service = Service.objects.select_for_update().get(pk=service_id)
    _ensure_unlocked(service)
    if not can_operate_service(actor, service):
        raise PermissionDenied("No puede operar este servicio.")
    if service.status != Service.Status.IN_PROGRESS:
        raise ValidationError("Las observaciones técnicas se cargan durante un servicio en curso.")
    service.completion_notes = "\n".join(filter(None, [service.completion_notes.strip(), note]))
    service.version += 1
    service.updated_by = actor
    service.save(update_fields=["completion_notes", "version", "updated_by", "updated_at"])
    _event(service, ServiceEvent.Kind.NOTE_ADDED, actor, occurred_at=occurred_at, payload={"note": note})
    publish_service_change(service, "note_added")
    return service


@transaction.atomic
def complete_service(service_id, actor, notes, *, occurred_at=None):
    notes = (notes or "").strip()
    if not notes:
        raise ValidationError("Debe registrar una observación antes de finalizar.")
    service = Service.objects.select_for_update().get(pk=service_id)
    _ensure_unlocked(service)
    if not can_operate_service(actor, service):
        raise PermissionDenied("No puede operar este servicio.")
    if service.status != Service.Status.IN_PROGRESS:
        raise ValidationError("Solo un servicio en curso puede finalizarse.")
    service.completion_notes = notes
    service.completed_at = occurred_at or timezone.now()
    service.status = Service.Status.COMPLETED
    service.version += 1
    service.updated_by = actor
    service.save(update_fields=["completion_notes", "completed_at", "status", "version", "updated_by", "updated_at"])
    _event(service, ServiceEvent.Kind.COMPLETED, actor, occurred_at=service.completed_at)
    publish_service_change(service, "completed")
    _notify_admins("Servicio finalizado", f"La orden {str(service.id)[:8]} fue finalizada.", service)
    return service


@transaction.atomic
def cancel_service(service_id, actor, reason):
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError("Cancelar exige un motivo.")
    service = Service.objects.select_for_update().get(pk=service_id)
    _ensure_unlocked(service)
    if service.status in [Service.Status.COMPLETED, Service.Status.CANCELLED]:
        raise ValidationError("El servicio ya está en un estado terminal.")
    service.status = Service.Status.CANCELLED
    service.cancellation_reason = reason
    service.version += 1
    service.updated_by = actor
    service.save(update_fields=["status", "cancellation_reason", "version", "updated_by", "updated_at"])
    _event(service, ServiceEvent.Kind.CANCELLED, actor, reason=reason)
    _audit(actor, "service.cancel", service)
    publish_service_change(service, "cancelled")
    _notify_technician(service, "Servicio cancelado", "Una orden asignada fue cancelada. Revisá tu agenda.")
    return service


@transaction.atomic
def reopen_service(service_id, actor, reason):
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError("Reabrir exige un motivo.")
    service = Service.objects.select_for_update().get(pk=service_id)
    _ensure_unlocked(service)
    if service.status == Service.Status.COMPLETED:
        service.status = Service.Status.IN_PROGRESS
        service.completed_at = None
    elif service.status == Service.Status.CANCELLED:
        service.status = Service.Status.ASSIGNED if service.assigned_technician_id else Service.Status.PENDING
        service.cancellation_reason = ""
    else:
        raise ValidationError("Solo se puede reabrir un servicio finalizado o cancelado.")
    service.version += 1
    service.updated_by = actor
    service.save()
    _event(service, ServiceEvent.Kind.REOPENED, actor, reason=reason)
    _audit(actor, "service.reopen", service)
    publish_service_change(service, "reopened")
    _notify_technician(service, "Servicio reabierto", "Una orden volvió a estar activa. Revisá su estado.")
    return service


@transaction.atomic
def create_payment(service, actor, *, amount, method, paid_at=None, note=""):
    locked_service = Service.objects.select_for_update().get(pk=service.pk)
    _ensure_unlocked(locked_service)
    payment = Payment(service=locked_service, amount=Decimal(amount), method=method, paid_at=paid_at or timezone.now(), note=note, recorded_by=actor)
    payment.full_clean()
    payment.save()
    _audit(actor, "payment.create", payment, {"service_id": str(service.id), "amount": str(payment.amount)})
    return payment


@transaction.atomic
def void_payment(payment_id, actor, reason):
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError("Anular un pago exige un motivo.")
    payment = Payment.objects.select_for_update().get(pk=payment_id)
    if payment.voided_at:
        raise ValidationError("El pago ya está anulado.")
    payment.voided_at = timezone.now()
    payment.voided_by = actor
    payment.void_reason = reason
    payment.save(update_fields=["voided_at", "voided_by", "void_reason", "updated_at"])
    _audit(actor, "payment.void", payment, {"reason": reason})
    return payment


def _sync_conflict(service, actor, operation_id, operation_type, base_version, occurred_at, payload, reason):
    operation = SyncOperation.objects.create(
        operation_id=operation_id,
        service=service,
        actor=actor,
        operation_type=operation_type,
        base_version=base_version,
        occurred_at=occurred_at,
        payload=payload,
        status=SyncOperation.Status.CONFLICT,
        result={"reason": reason, "current_version": service.version},
    )
    SyncConflict.objects.create(operation=operation, service=service, reason=reason, evidence=payload)
    service.requires_review = True
    service.save(update_fields=["requires_review", "updated_at"])
    _event(service, ServiceEvent.Kind.CONFLICT, actor, reason=reason, occurred_at=occurred_at, payload=payload)
    publish_service_change(service, "conflict")
    _notify_admins("Conflicto de sincronización", f"La orden {str(service.id)[:8]} requiere revisión.", service)
    return {"operation_id": str(operation_id), "status": "conflict", "reason": reason, "current_version": service.version}


@transaction.atomic
def apply_sync_operation(actor, data):
    operation_id = data["operation_id"]
    existing = SyncOperation.objects.filter(operation_id=operation_id).first()
    if existing:
        return {"operation_id": str(operation_id), "status": "duplicate", "result": existing.result, "current_version": existing.service.version}

    service = Service.objects.select_for_update().get(pk=data["service_id"])
    operation_type = data["type"]
    occurred_at = data["occurred_at"]
    base_version = data["base_version"]
    payload = data.get("payload") or {}
    profile = get_technician_profile(actor)
    if not profile or service.assigned_technician_id != profile.id:
        return _sync_conflict(service, actor, operation_id, operation_type, base_version, occurred_at, payload, "El servicio fue reasignado o la cuenta técnica está inactiva.")
    if service.status == Service.Status.CANCELLED:
        return _sync_conflict(service, actor, operation_id, operation_type, base_version, occurred_at, payload, "El servicio fue cancelado mientras el dispositivo estaba offline.")

    try:
        if operation_type == SyncOperation.Type.ARRIVE:
            service = arrive_service(service.id, actor, occurred_at=occurred_at)
        elif operation_type == SyncOperation.Type.ADD_NOTE:
            service = add_service_note(service.id, actor, payload.get("note", ""), occurred_at=occurred_at)
        elif operation_type == SyncOperation.Type.COMPLETE:
            service = complete_service(service.id, actor, payload.get("notes", ""), occurred_at=occurred_at)
        else:
            raise ValidationError("Tipo de operación no soportado.")
    except (ValidationError, PermissionDenied) as exc:
        return _sync_conflict(service, actor, operation_id, operation_type, base_version, occurred_at, payload, str(exc))

    result = {"service_id": str(service.id), "version": service.version, "status": service.status}
    SyncOperation.objects.create(
        operation_id=operation_id,
        service=service,
        actor=actor,
        operation_type=operation_type,
        base_version=base_version,
        occurred_at=occurred_at,
        payload=payload,
        status=SyncOperation.Status.APPLIED,
        result=result,
    )
    return {"operation_id": str(operation_id), "status": "applied", "result": result, "current_version": service.version}
