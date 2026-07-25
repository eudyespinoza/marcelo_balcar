from django.db import migrations


def add_role_permissions(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    client_type, _ = ContentType.objects.get_or_create(app_label="operations", model="client")
    sensitive, _ = Permission.objects.get_or_create(
        content_type=client_type,
        codename="view_client_sensitive",
        defaults={"name": "Puede ver datos sensibles de clientes"},
    )
    photo_permissions = Permission.objects.filter(
        content_type__app_label="operations",
        codename__in=["add_servicephoto", "change_servicephoto", "delete_servicephoto", "view_servicephoto"],
    )
    for role_name in ["Administrador", "Coordinador"]:
        group = Group.objects.filter(name=role_name).first()
        if group:
            group.permissions.add(sensitive, *photo_permissions)


class Migration(migrations.Migration):
    dependencies = [("operations", "0005_alter_client_options")]
    operations = [migrations.RunPython(add_role_permissions, migrations.RunPython.noop)]
