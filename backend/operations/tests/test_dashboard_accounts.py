from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from operations.models import Client, PaymentMethod, Service, User
from operations.services import create_payment


@pytest.mark.django_db
def test_dashboard_groups_delinquent_and_outstanding_accounts_by_client():
    user = User.objects.create_superuser(username="dashboard-accounts", password="Clave-segura-2026", must_change_password=False)
    delinquent = Client.objects.create(name="Cliente en mora", phone="3435000100", is_delinquent=True)
    delinquent_without_balance = Client.objects.create(name="Mora sin saldo", phone="3435000101", is_delinquent=True)
    current = Client.objects.create(name="Cliente con saldo", phone="3435000102")
    paid = Client.objects.create(name="Cliente al día", phone="3435000103")

    delinquent_service = Service.objects.create(client=delinquent, description="Trabajo", amount_due=Decimal("1000.00"))
    current_service = Service.objects.create(client=current, description="Trabajo", amount_due=Decimal("250.00"))
    paid_service = Service.objects.create(client=paid, description="Trabajo", amount_due=Decimal("500.00"))
    Service.objects.create(client=current, description="Cancelado", amount_due=Decimal("900.00"), status=Service.Status.CANCELLED)
    cash = PaymentMethod.objects.get(code="cash")
    create_payment(delinquent_service, user, amount="400.00", method=cash)
    create_payment(paid_service, user, amount="500.00", method=cash)

    client = APIClient()
    client.force_login(user)
    response = client.get("/api/v1/dashboard/today/")

    assert response.status_code == 200
    assert response.data["accounts"]["delinquent"] == [
        {
            "id": str(delinquent.id),
            "name": "Cliente en mora",
            "is_delinquent": True,
            "outstanding_balance": "600.00",
        },
        {
            "id": str(delinquent_without_balance.id),
            "name": "Mora sin saldo",
            "is_delinquent": True,
            "outstanding_balance": "0.00",
        },
    ]
    assert response.data["accounts"]["outstanding"] == [
        {
            "id": str(delinquent.id),
            "name": "Cliente en mora",
            "is_delinquent": True,
            "outstanding_balance": "600.00",
        },
        {
            "id": str(current.id),
            "name": "Cliente con saldo",
            "is_delinquent": False,
            "outstanding_balance": "250.00",
        },
    ]
