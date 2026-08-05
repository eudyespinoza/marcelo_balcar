from decimal import Decimal

import pytest
from django.contrib.auth.models import Permission
from rest_framework.test import APIClient

from operations.models import Client, PaymentMethod, Service, User
from operations.services import create_payment, void_payment


def authenticated(user):
    client = APIClient()
    client.force_login(user)
    return client


@pytest.mark.django_db
def test_client_account_summarizes_balances_and_preserves_payment_history():
    user = User.objects.create_superuser(
        username="client-account",
        password="Clave-segura-2026",
        must_change_password=False,
    )
    customer = Client.objects.create(
        name="Cliente en mora",
        phone="3435000200",
        is_delinquent=True,
    )
    first = Service.objects.create(
        client=customer,
        description="Portón principal",
        amount_due=Decimal("1000.00"),
    )
    second = Service.objects.create(
        client=customer,
        description="Control remoto",
        amount_due=Decimal("250.00"),
    )
    Service.objects.create(
        client=customer,
        description="Servicio cancelado",
        amount_due=Decimal("900.00"),
        status=Service.Status.CANCELLED,
    )
    cash = PaymentMethod.objects.get(code="cash")
    valid_payment = create_payment(first, user, amount="400.00", method=cash)
    voided_payment = create_payment(second, user, amount="100.00", method=cash)
    void_payment(voided_payment.id, user, "Carga duplicada")

    response = authenticated(user).get(f"/api/v1/clients/{customer.id}/account/")

    assert response.status_code == 200
    assert response.data["client"] == str(customer.id)
    assert response.data["is_delinquent"] is True
    assert response.data["billed_total"] == "1250.00"
    assert response.data["collected_total"] == "400.00"
    assert response.data["outstanding_total"] == "850.00"
    assert response.data["last_payment"]["id"] == str(valid_payment.id)
    assert [item["id"] for item in response.data["outstanding_services"]] == [
        str(first.id),
        str(second.id),
    ]
    assert response.data["outstanding_services"][0]["paid_amount"] == "400.00"
    assert response.data["outstanding_services"][0]["balance"] == "600.00"
    assert response.data["outstanding_services"][1]["balance"] == "250.00"
    assert {item["id"] for item in response.data["payments"]} == {
        str(valid_payment.id),
        str(voided_payment.id),
    }
    assert next(item for item in response.data["payments"] if item["id"] == str(voided_payment.id))["voided_at"] is not None


@pytest.mark.django_db
def test_client_account_requires_billing_permission():
    user = User.objects.create_user(
        username="client-without-billing",
        password="Clave-segura-2026",
        must_change_password=False,
    )
    user.user_permissions.add(Permission.objects.get(codename="view_client"))
    customer = Client.objects.create(name="Cliente protegido", phone="3435000201")

    response = authenticated(user).get(f"/api/v1/clients/{customer.id}/account/")

    assert response.status_code == 403
