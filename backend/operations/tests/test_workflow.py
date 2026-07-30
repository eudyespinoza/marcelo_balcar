from decimal import Decimal

import pytest
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.utils import timezone

from operations.models import Address, Client, Payment, PaymentMethod, Service, SyncConflict, TechnicianProfile, User
from operations.permissions import GROUP_TECHNICIAN
from operations.services import apply_sync_operation, arrive_service, assign_service, complete_service, create_payment, void_payment


@pytest.fixture
def client_record(db):
    return Client.objects.create(name="Cliente prueba", phone="343 555 0101", normalized_phone="3435550101", dni="12345678", normalized_dni="12345678")


@pytest.fixture
def technician(db):
    user = User.objects.create_user(username="tecnico", password="una-clave-muy-segura")
    user.groups.add(Group.objects.get(name=GROUP_TECHNICIAN))
    profile = TechnicianProfile.objects.create(user=user, display_name="Técnico prueba", active=True)
    return user, profile


@pytest.fixture
def assigned_service(client_record, technician):
    user, profile = technician
    address = Address.objects.create(client=client_record, full_text="Calle de prueba 123")
    return Service.objects.create(
        client=client_record,
        address=address,
        client_name_snapshot=client_record.name,
        client_phone_snapshot=client_record.phone,
        address_snapshot=address.full_text,
        description="Reparar portón",
        scheduled_at=timezone.now(),
        assigned_technician=profile,
        status=Service.Status.ASSIGNED,
    )


@pytest.mark.django_db
def test_assign_unassigned_service(client_record, technician):
    admin = User.objects.create_superuser(username="admin-asignacion", password="una-clave-muy-segura")
    _, profile = technician
    service = Service.objects.create(
        client=client_record,
        description="Presupuesto",
        status=Service.Status.PENDING,
    )

    assigned, overlaps = assign_service(service.id, profile, admin)

    assert overlaps == []
    assert assigned.assigned_technician_id == profile.id
    assert assigned.status == Service.Status.ASSIGNED


@pytest.mark.django_db
def test_technician_arrives_and_completes(technician, assigned_service):
    user, _ = technician
    arrived = arrive_service(assigned_service.id, user)
    assert arrived.status == Service.Status.IN_PROGRESS
    assert arrived.arrival_at is not None

    completed = complete_service(assigned_service.id, user, "Se ajustó el fin de carrera y se probó el motor.")
    assert completed.status == Service.Status.COMPLETED
    assert completed.completed_at is not None
    assert completed.version == 3
    assert list(completed.events.values_list("kind", flat=True)) == ["ARRIVED", "COMPLETED"]


@pytest.mark.django_db
def test_completion_requires_note(technician, assigned_service):
    user, _ = technician
    arrive_service(assigned_service.id, user)
    with pytest.raises(ValidationError):
        complete_service(assigned_service.id, user, "  ")


@pytest.mark.django_db
def test_technician_can_record_cash_when_completing(technician, assigned_service):
    user, _ = technician
    assigned_service.amount_due = Decimal("1000.00")
    assigned_service.save(update_fields=["amount_due", "updated_at"])
    arrive_service(assigned_service.id, user)

    completed = complete_service(
        assigned_service.id,
        user,
        "Se completó el mantenimiento.",
        collected_amount="350.50",
    )

    payment = Payment.objects.get(service=completed)
    assert payment.amount == Decimal("350.50")
    assert payment.method.code == "cash"
    assert payment.recorded_by == user
    assert payment.paid_at == completed.completed_at


@pytest.mark.django_db
def test_invalid_collection_rolls_back_completion(technician, assigned_service):
    user, _ = technician
    assigned_service.amount_due = Decimal("100.00")
    assigned_service.save(update_fields=["amount_due", "updated_at"])
    arrive_service(assigned_service.id, user)

    with pytest.raises(ValidationError):
        complete_service(
            assigned_service.id,
            user,
            "Trabajo terminado.",
            collected_amount="100.01",
        )

    assigned_service.refresh_from_db()
    assert assigned_service.status == Service.Status.IN_PROGRESS
    assert assigned_service.completed_at is None
    assert not Payment.objects.filter(service=assigned_service).exists()


@pytest.mark.django_db
def test_offline_completion_records_collection_once(technician, assigned_service):
    user, _ = technician
    assigned_service.amount_due = Decimal("1000.00")
    assigned_service.save(update_fields=["amount_due", "updated_at"])
    arrived = arrive_service(assigned_service.id, user)
    operation = {
        "operation_id": "c4f7d8f5-6ab6-4211-8e4b-70bf1b1057a8",
        "service_id": assigned_service.id,
        "type": "COMPLETE",
        "base_version": arrived.version,
        "occurred_at": timezone.now(),
        "payload": {"notes": "Cierre sin conexión.", "collected_amount": "250.00"},
    }

    first = apply_sync_operation(user, operation)
    duplicate = apply_sync_operation(user, operation)

    assert first["status"] == "applied"
    assert duplicate["status"] == "duplicate"
    assert Payment.objects.filter(service=assigned_service, amount=Decimal("250.00")).count() == 1


@pytest.mark.django_db
def test_offline_action_after_cancellation_becomes_conflict(technician, assigned_service):
    user, _ = technician
    assigned_service.status = Service.Status.CANCELLED
    assigned_service.version = 2
    assigned_service.save()
    result = apply_sync_operation(
        user,
        {
            "operation_id": "a5f80e13-c0c0-4aac-9c9c-6f1270ce2c20",
            "service_id": assigned_service.id,
            "type": "ARRIVE",
            "base_version": 1,
            "occurred_at": timezone.now(),
            "payload": {"device": "offline"},
        },
    )
    assert result["status"] == "conflict"
    assert SyncConflict.objects.filter(service=assigned_service).exists()
    assigned_service.refresh_from_db()
    assert assigned_service.requires_review is True


@pytest.mark.django_db
def test_partial_payments_and_void(client_record):
    admin = User.objects.create_superuser(username="admin", password="una-clave-muy-segura")
    service = Service.objects.create(client=client_record, description="Cambio de placa", amount_due=Decimal("100000.00"))
    method = PaymentMethod.objects.get(code="transfer")
    first = create_payment(service, admin, amount="35000.00", method=method)
    second = create_payment(service, admin, amount="25000.00", method=method)
    service.refresh_from_db()
    assert service.paid_amount == Decimal("60000.00")
    assert service.balance == Decimal("40000.00")
    assert service.payment_status == "PARTIAL"

    void_payment(second.id, admin, "Transferencia duplicada")
    service.refresh_from_db()
    assert service.paid_amount == Decimal("35000.00")
    assert first.voided_at is None


@pytest.mark.django_db
def test_payment_cannot_exceed_balance(client_record):
    admin = User.objects.create_superuser(username="admin", password="una-clave-muy-segura")
    service = Service.objects.create(client=client_record, description="Servicio", amount_due=Decimal("1000.00"))
    method = PaymentMethod.objects.get(code="cash")
    with pytest.raises(ValidationError):
        create_payment(service, admin, amount="1000.01", method=method)
