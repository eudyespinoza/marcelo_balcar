from datetime import datetime, timedelta
import uuid
from decimal import Decimal
from io import BytesIO

import pytest
from PIL import Image
from django.contrib.auth.models import Group, Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from operations.models import ApplicationSettings, Client, PaymentMethod, Service, ServiceEvent, ServicePhoto, TechnicianProfile, User
from operations.permissions import GROUP_ADMIN, GROUP_SUPERADMIN
from operations.services import create_payment, void_payment


def authenticated(user):
    client = APIClient()
    client.force_login(user)
    return client


@pytest.mark.django_db
def test_application_settings_are_shared_and_only_editable_with_permission():
    administrator = User.objects.create_user(username="config-admin", password="Clave-segura-2026", must_change_password=False)
    administrator.groups.add(Group.objects.get(name=GROUP_ADMIN))
    viewer = User.objects.create_user(username="config-viewer", password="Clave-segura-2026", must_change_password=False)

    initial = authenticated(viewer).get("/api/v1/settings/")
    assert initial.status_code == 200
    assert initial.data["base_message"] == ApplicationSettings.DEFAULT_BASE_MESSAGE

    updated = authenticated(administrator).patch(
        "/api/v1/settings/",
        {"base_message": "Hola, estamos afuera de tu domicilio."},
        format="json",
    )
    assert updated.status_code == 200
    assert updated.data["base_message"] == "Hola, estamos afuera de tu domicilio."
    assert authenticated(viewer).get("/api/v1/settings/").data["base_message"] == updated.data["base_message"]
    assert authenticated(viewer).patch("/api/v1/settings/", {"base_message": "No autorizado"}, format="json").status_code == 403


@pytest.mark.django_db
def test_application_settings_reject_an_empty_base_message():
    administrator = User.objects.create_user(username="config-empty", password="Clave-segura-2026", must_change_password=False)
    administrator.groups.add(Group.objects.get(name=GROUP_ADMIN))

    response = authenticated(administrator).patch("/api/v1/settings/", {"base_message": "   "}, format="json")

    assert response.status_code == 400


@pytest.mark.django_db
def test_temporary_password_is_enforced_and_can_be_changed():
    user = User.objects.create_superuser(username="primer-ingreso", password="Clave-temporal-segura-2026")
    client = APIClient()
    response = client.post("/api/v1/auth/login/", {"username": user.username, "password": "Clave-temporal-segura-2026"}, format="json")
    assert response.status_code == 200
    assert client.get("/api/v1/clients/").status_code == 403

    changed = client.post(
        "/api/v1/auth/change-password/",
        {"current_password": "Clave-temporal-segura-2026", "new_password": "Nueva-clave-personal-2026!"},
        format="json",
    )
    assert changed.status_code == 200
    assert client.get("/api/v1/clients/").status_code == 200
    user.refresh_from_db()
    assert user.must_change_password is False


@pytest.mark.django_db
def test_non_superuser_cannot_grant_superadmin_role_to_self():
    actor = User.objects.create_user(username="administrador", password="Clave-segura-2026", must_change_password=False)
    actor.groups.add(Group.objects.get(name=GROUP_ADMIN))
    superadmin = Group.objects.get(name=GROUP_SUPERADMIN)
    response = authenticated(actor).patch(f"/api/v1/users/{actor.id}/", {"role_ids": [superadmin.id]}, format="json")
    assert response.status_code == 403
    assert not actor.groups.filter(name=GROUP_SUPERADMIN).exists()


@pytest.mark.django_db
def test_last_active_superadmin_cannot_be_disabled():
    actor = User.objects.create_superuser(username="root", password="Clave-segura-2026", must_change_password=False)
    target = User.objects.create_user(username="responsable", password="Clave-segura-2026", must_change_password=False)
    target.groups.add(Group.objects.get(name=GROUP_SUPERADMIN))
    response = authenticated(actor).patch(f"/api/v1/users/{target.id}/", {"is_active": False}, format="json")
    assert response.status_code == 400
    target.refresh_from_db()
    assert target.is_active is True


@pytest.mark.django_db
def test_payment_api_accepts_partial_payment_and_rejects_overpayment():
    user = User.objects.create_superuser(username="caja", password="Clave-segura-2026", must_change_password=False)
    customer = Client.objects.create(name="Cliente caja", phone="3435000001")
    service = Service.objects.create(client=customer, description="Trabajo", amount_due=Decimal("1000.00"))
    method = PaymentMethod.objects.get(code="cash")
    client = authenticated(user)
    first = client.post("/api/v1/payments/", {"service": service.id, "amount": "400.00", "method": method.id}, format="json")
    assert first.status_code == 201
    rejected = client.post("/api/v1/payments/", {"service": service.id, "amount": "700.00", "method": method.id}, format="json")
    assert rejected.status_code == 400
    service.refresh_from_db()
    assert service.balance == Decimal("600.00")


@pytest.mark.django_db
def test_overlap_rejection_rolls_back_schedule_and_history():
    user = User.objects.create_superuser(username="agenda", password="Clave-segura-2026", must_change_password=False)
    customer = Client.objects.create(name="Cliente agenda", phone="3435000002")
    technician = TechnicianProfile.objects.create(display_name="Técnico agenda", active=True)
    first_time = timezone.make_aware(datetime(2026, 7, 23, 10, 0))
    original_time = timezone.make_aware(datetime(2026, 7, 23, 13, 0))
    Service.objects.create(client=customer, description="Primero", scheduled_at=first_time, assigned_technician=technician, status=Service.Status.ASSIGNED)
    moving = Service.objects.create(client=customer, description="Segundo", scheduled_at=original_time, assigned_technician=technician, status=Service.Status.ASSIGNED)
    response = authenticated(user).patch(
        f"/api/v1/services/{moving.id}/",
        {"scheduled_at": timezone.make_aware(datetime(2026, 7, 23, 10, 30)).isoformat()},
        format="json",
    )
    assert response.status_code == 400
    moving.refresh_from_db()
    assert moving.scheduled_at == original_time
    assert moving.version == 1
    assert not ServiceEvent.objects.filter(service=moving, kind=ServiceEvent.Kind.RESCHEDULED).exists()


@pytest.mark.django_db
def test_service_photo_is_hashed_and_only_served_through_authenticated_api(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path
    user = User.objects.create_superuser(username="fotos", password="Clave-segura-2026", must_change_password=False)
    customer = Client.objects.create(name="Cliente foto", phone="3435000003")
    service = Service.objects.create(client=customer, description="Foto")
    buffer = BytesIO()
    Image.new("RGB", (2, 2), "orange").save(buffer, format="PNG")
    upload = SimpleUploadedFile("evidencia.png", buffer.getvalue(), content_type="image/png")
    client = authenticated(user)
    created = client.post("/api/v1/service-photos/", {"service": service.id, "image": upload}, format="multipart")
    assert created.status_code == 201
    photo = ServicePhoto.objects.get(pk=created.data["id"])
    assert len(photo.checksum_sha256) == 64
    file_response = client.get(f"/api/v1/service-photos/{photo.id}/file/")
    assert file_response.status_code == 200
    assert file_response["Content-Type"] == "image/png"
    assert APIClient().get(f"/api/v1/service-photos/{photo.id}/file/").status_code in {401, 403}


@pytest.mark.django_db
def test_custom_read_only_role_does_not_receive_sensitive_client_fields():
    user = User.objects.create_user(username="lector", password="Clave-segura-2026", must_change_password=False)
    role = Group.objects.create(name="Lectura limitada")
    role.permissions.add(Permission.objects.get(codename="view_client", content_type__app_label="operations"))
    user.groups.add(role)
    customer = Client.objects.create(name="Privado", phone="3435000010", dni="30123456", is_delinquent=True)
    response = authenticated(user).get(f"/api/v1/clients/{customer.id}/")
    assert response.status_code == 200
    assert "dni" not in response.data
    assert "is_delinquent" not in response.data


@pytest.mark.django_db
def test_client_list_filters_by_boolean_delinquency_condition():
    user = User.objects.create_superuser(username="mora", password="Clave-segura-2026", must_change_password=False)
    delinquent = Client.objects.create(name="Cliente en mora", phone="3435000020", is_delinquent=True)
    current = Client.objects.create(name="Cliente al dia", phone="3435000021", is_delinquent=False)
    client = authenticated(user)

    delinquent_response = client.get("/api/v1/clients/?is_delinquent=true")
    current_response = client.get("/api/v1/clients/?is_delinquent=false")

    assert delinquent_response.status_code == 200
    assert {item["id"] for item in delinquent_response.data["results"]} == {str(delinquent.id)}
    assert current_response.status_code == 200
    assert {item["id"] for item in current_response.data["results"]} == {str(current.id)}


@pytest.mark.django_db
def test_client_delinquency_filter_requires_sensitive_data_permission():
    user = User.objects.create_user(username="lector-mora", password="Clave-segura-2026", must_change_password=False)
    role = Group.objects.create(name="Lectura sin mora")
    role.permissions.add(Permission.objects.get(codename="view_client", content_type__app_label="operations"))
    user.groups.add(role)

    response = authenticated(user).get("/api/v1/clients/?is_delinquent=true")

    assert response.status_code == 403


@pytest.mark.django_db
def test_nested_photo_upload_is_idempotent(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path
    user = User.objects.create_superuser(username="foto-idempotente", password="Clave-segura-2026", must_change_password=False)
    customer = Client.objects.create(name="Cliente foto dos", phone="3435000011")
    service = Service.objects.create(client=customer, description="Foto idempotente")
    operation_id = uuid.uuid4()
    client = authenticated(user)

    def image_file():
        buffer = BytesIO()
        Image.new("RGB", (2, 2), "#242825").save(buffer, format="PNG")
        return SimpleUploadedFile("evidencia.png", buffer.getvalue(), content_type="image/png")

    first = client.post(f"/api/v1/services/{service.id}/photos/", {"client_operation_id": operation_id, "image": image_file()}, format="multipart")
    second = client.post(f"/api/v1/services/{service.id}/photos/", {"client_operation_id": operation_id, "image": image_file()}, format="multipart")
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.data["id"] == second.data["id"]
    assert ServicePhoto.objects.filter(service=service).count() == 1


@pytest.mark.django_db
def test_daily_cash_reports_a_prior_payment_voided_today_as_reversal():
    user = User.objects.create_superuser(username="caja-reversa", password="Clave-segura-2026", must_change_password=False)
    customer = Client.objects.create(name="Cliente reversa", phone="3435000012")
    service = Service.objects.create(client=customer, description="Reversa", amount_due=Decimal("500.00"))
    payment = create_payment(service, user, amount="500.00", method=PaymentMethod.objects.get(code="cash"), paid_at=timezone.now() - timedelta(days=2))
    void_payment(payment.id, user, "Anulación posterior")
    response = authenticated(user).get(f"/api/v1/reports/daily-cash/?date={timezone.localdate().isoformat()}")
    assert response.status_code == 200
    assert Decimal(str(response.data["total"])) == Decimal("-500.00")
    assert Decimal(str(response.data["voided_total"])) == Decimal("500.00")


@pytest.mark.django_db
def test_dashboard_exposes_customer_service_and_financial_analytics():
    user = User.objects.create_superuser(username="dashboard", password="Clave-segura-2026", must_change_password=False)
    technician = TechnicianProfile.objects.create(display_name="Técnico tablero", active=True)
    delinquent = Client.objects.create(name="Cliente en mora", phone="3435000030", is_delinquent=True)
    current = Client.objects.create(name="Cliente al día", phone="3435000031", is_delinquent=False)
    yesterday = timezone.now() - timedelta(days=1)
    completed = Service.objects.create(
        client=delinquent,
        description="Servicio finalizado",
        scheduled_at=yesterday,
        completed_at=yesterday + timedelta(hours=1),
        assigned_technician=technician,
        status=Service.Status.COMPLETED,
        amount_due=Decimal("1000.00"),
    )
    assigned = Service.objects.create(
        client=current,
        description="Servicio asignado",
        scheduled_at=timezone.now(),
        assigned_technician=technician,
        status=Service.Status.ASSIGNED,
        amount_due=Decimal("500.00"),
    )
    Service.objects.create(
        client=current,
        description="Servicio cancelado",
        scheduled_at=timezone.now(),
        status=Service.Status.CANCELLED,
        amount_due=Decimal("300.00"),
    )
    cash = PaymentMethod.objects.get(code="cash")
    create_payment(completed, user, amount="400.00", method=cash, paid_at=timezone.now())
    create_payment(assigned, user, amount="500.00", method=cash, paid_at=timezone.now())

    response = authenticated(user).get("/api/v1/dashboard/today/")

    assert response.status_code == 200
    assert response.data["overview"] == {
        "clients_total": 2,
        "delinquent_clients": 1,
        "active_users": 1,
        "active_technicians": 1,
        "services_total": 3,
        "unassigned_services": 1,
        "unscheduled_services": 0,
        "completion_rate": 50.0,
    }
    assert response.data["finance"] == {
        "billed_total": "1500.00",
        "collected_total": "900.00",
        "outstanding_total": "600.00",
        "delinquent_balance": "600.00",
        "collection_rate": 60.0,
        "collected_this_month": "900.00",
    }
    status_counts = {item["status"]: item["count"] for item in response.data["status_breakdown"]}
    assert status_counts[Service.Status.COMPLETED] == 1
    assert status_counts[Service.Status.ASSIGNED] == 1
    assert status_counts[Service.Status.CANCELLED] == 1
    daily = {item["date"]: item for item in response.data["service_trend"]}
    assert daily[timezone.localdate(yesterday).isoformat()]["completed"] == 1
    assert daily[timezone.localdate().isoformat()]["scheduled"] == 2
    assert response.data["technician_workload"][0]["name"] == "Técnico tablero"
    assert response.data["technician_workload"][0]["total"] == 2
    assert response.data["payment_methods"] == [{"name": "Efectivo", "total": "900.00", "count": 2}]
