from django.contrib.auth.models import Group, Permission
from django.db.models.signals import post_migrate
from django.dispatch import receiver

from .models import PaymentMethod
from .permissions import GROUP_ADMIN, GROUP_COORDINATOR, GROUP_SUPERADMIN, GROUP_TECHNICIAN


ROLE_PERMISSIONS = {
    GROUP_SUPERADMIN: "*",
    GROUP_ADMIN: [
        "add_user", "change_user", "view_user", "manage_users",
        "add_technicianprofile", "change_technicianprofile", "view_technicianprofile",
        "add_client", "change_client", "view_client", "archive_client", "restore_client", "view_client_sensitive",
        "add_address", "change_address", "view_address", "archive_address", "restore_address",
        "add_service", "change_service", "view_service", "assign_service", "cancel_service", "reopen_service", "override_overlap", "archive_service", "view_dashboard",
        "add_servicephoto", "change_servicephoto", "delete_servicephoto", "view_servicephoto",
        "view_billing", "manage_billing", "view_daily_cash", "view_payment", "add_payment", "change_payment",
        "view_dataissue", "change_dataissue", "view_syncconflict", "change_syncconflict",
        "view_applicationsettings", "change_applicationsettings",
    ],
    GROUP_COORDINATOR: [
        "view_technicianprofile",
        "add_client", "change_client", "view_client", "archive_client", "restore_client", "view_client_sensitive",
        "add_address", "change_address", "view_address", "archive_address", "restore_address",
        "add_service", "change_service", "view_service", "assign_service", "cancel_service", "reopen_service", "override_overlap", "archive_service", "view_dashboard",
        "add_servicephoto", "change_servicephoto", "delete_servicephoto", "view_servicephoto",
        "view_billing", "manage_billing", "view_daily_cash", "view_payment", "add_payment", "change_payment",
        "view_dataissue", "change_dataissue", "view_syncconflict", "change_syncconflict",
        "view_applicationsettings", "change_applicationsettings",
    ],
    GROUP_TECHNICIAN: ["view_service", "arrive_service", "complete_service", "add_servicephoto", "view_servicephoto", "view_client", "view_address"],
}


@receiver(post_migrate)
def seed_roles_and_payment_methods(sender, **kwargs):
    if sender.name != "operations":
        return
    operation_permissions = Permission.objects.filter(content_type__app_label="operations")
    for group_name, codenames in ROLE_PERMISSIONS.items():
        group, created = Group.objects.get_or_create(name=group_name)
        permissions = operation_permissions if codenames == "*" else operation_permissions.filter(codename__in=codenames)
        if created:
            group.permissions.set(permissions)
        else:
            group.permissions.add(*permissions)

    methods = [
        ("cash", "Efectivo"),
        ("transfer", "Transferencia"),
        ("debit", "Débito"),
        ("credit", "Crédito"),
        ("mercado-pago", "Mercado Pago"),
        ("other", "Otro"),
    ]
    for index, (code, name) in enumerate(methods):
        PaymentMethod.objects.get_or_create(code=code, defaults={"name": name, "sort_order": index, "active": True})
