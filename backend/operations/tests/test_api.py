from decimal import Decimal

import pytest
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APIClient

from operations.models import Address, Client, Service, TechnicianProfile, User
from operations.permissions import GROUP_ADMIN, GROUP_TECHNICIAN


@pytest.mark.django_db
def test_technician_serializer_never_leaks_finance_or_sensitive_client_data():
    user = User.objects.create_user(username="tecnico", password="una-clave-muy-segura", must_change_password=False)
    user.groups.add(Group.objects.get(name=GROUP_TECHNICIAN))
    profile = TechnicianProfile.objects.create(user=user, display_name="Técnico", active=True)
    customer = Client.objects.create(
        name="Cliente privado",
        phone="3435559999",
        normalized_phone="3435559999",
        dni="30111222",
        normalized_dni="30111222",
        is_delinquent=True,
    )
    address = Address.objects.create(client=customer, full_text="Dirección privada")
    service = Service.objects.create(
        client=customer,
        address=address,
        description="Servicio asignado",
        assigned_technician=profile,
        status=Service.Status.ASSIGNED,
        amount_due=Decimal("50000.00"),
    )
    api = APIClient()
    api.force_login(user)

    service_response = api.get(f"/api/v1/services/{service.id}/")
    assert service_response.status_code == 200
    assert "amount_due" not in service_response.data
    assert "payments" not in service_response.data

    client_response = api.get(f"/api/v1/clients/{customer.id}/")
    assert client_response.status_code == 200
    assert "dni" not in client_response.data
    assert "is_delinquent" not in client_response.data


@pytest.mark.django_db
def test_technician_only_sees_assigned_services():
    user = User.objects.create_user(username="tecnico", password="una-clave-muy-segura", must_change_password=False)
    user.groups.add(Group.objects.get(name=GROUP_TECHNICIAN))
    profile = TechnicianProfile.objects.create(user=user, display_name="Técnico", active=True)
    customer = Client.objects.create(name="Cliente", phone="3435550000", normalized_phone="3435550000")
    own = Service.objects.create(client=customer, description="Propio", assigned_technician=profile, status=Service.Status.ASSIGNED)
    foreign = Service.objects.create(client=customer, description="Ajeno")
    api = APIClient()
    api.force_login(user)
    response = api.get("/api/v1/services/")
    assert response.status_code == 200
    ids = {item["id"] for item in response.data["results"]}
    assert ids == {str(own.id)}
    assert api.get(f"/api/v1/services/{foreign.id}/").status_code == 404


@pytest.mark.django_db
def test_linked_technician_is_scoped_even_with_administrative_role():
    user = User.objects.create_user(username="tecnico-administrador", password="una-clave-muy-segura", must_change_password=False)
    user.groups.add(Group.objects.get(name=GROUP_ADMIN))
    profile = TechnicianProfile.objects.create(user=user, display_name="Técnico con rol administrativo", active=True)
    other_profile = TechnicianProfile.objects.create(display_name="Otro técnico", active=True)
    own_client = Client.objects.create(name="Cliente propio", phone="3435550101", normalized_phone="3435550101")
    foreign_client = Client.objects.create(name="Cliente ajeno", phone="3435550102", normalized_phone="3435550102")
    own = Service.objects.create(
        client=own_client,
        description="Servicio propio",
        scheduled_at=timezone.now(),
        assigned_technician=profile,
        status=Service.Status.ASSIGNED,
    )
    foreign = Service.objects.create(
        client=foreign_client,
        description="Servicio ajeno",
        scheduled_at=timezone.now(),
        assigned_technician=other_profile,
        status=Service.Status.ASSIGNED,
    )
    api = APIClient()
    api.force_login(user)

    session = api.get("/api/v1/auth/session/")
    services = api.get("/api/v1/services/")
    calendar = api.get("/api/v1/calendar/events/")
    dashboard = api.get("/api/v1/dashboard/today/")

    assert session.status_code == 200
    assert session.data["user"]["is_technician"] is True
    assert {item["id"] for item in services.data["results"]} == {str(own.id)}
    assert api.get(f"/api/v1/services/{foreign.id}/").status_code == 404
    assert api.get(f"/api/v1/clients/{foreign_client.id}/").status_code == 404
    assert {item["id"] for item in calendar.data} == {str(own.id)}
    assert {item["id"] for item in dashboard.data["services"]} == {str(own.id)}
    assert dashboard.data["counts"][Service.Status.ASSIGNED] == 1


@pytest.mark.django_db
def test_linked_technician_cannot_reassign_a_foreign_service_with_admin_role():
    user = User.objects.create_user(username="tecnico-reasignacion", password="una-clave-muy-segura", must_change_password=False)
    user.groups.add(Group.objects.get(name=GROUP_ADMIN))
    profile = TechnicianProfile.objects.create(user=user, display_name="Técnico solicitante", active=True)
    other_profile = TechnicianProfile.objects.create(display_name="Técnico asignado", active=True)
    customer = Client.objects.create(name="Cliente ajeno", phone="3435550103", normalized_phone="3435550103")
    foreign = Service.objects.create(client=customer, description="Servicio ajeno", assigned_technician=other_profile, status=Service.Status.ASSIGNED)
    api = APIClient()
    api.force_login(user)

    response = api.post(f"/api/v1/services/{foreign.id}/assign/", {"technician_id": profile.id}, format="json")

    assert response.status_code == 404
    foreign.refresh_from_db()
    assert foreign.assigned_technician_id == other_profile.id
