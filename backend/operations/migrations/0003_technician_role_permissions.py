from django.db import migrations


def add_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    defaults = {
        "Administrador": ["add_technicianprofile", "change_technicianprofile", "view_technicianprofile"],
        "Coordinador": ["view_technicianprofile"],
    }
    for name, codenames in defaults.items():
        group = Group.objects.filter(name=name).first()
        if group:
            group.permissions.add(*Permission.objects.filter(content_type__app_label="operations", codename__in=codenames))


class Migration(migrations.Migration):
    dependencies = [("operations", "0002_postgres_search")]
    operations = [migrations.RunPython(add_permissions, migrations.RunPython.noop)]
