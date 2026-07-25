from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("operations", "0003_technician_role_permissions")]
    operations = [
        migrations.AddField(
            model_name="servicephoto",
            name="client_operation_id",
            field=models.UUIDField(blank=True, db_index=True, null=True, unique=True),
        ),
    ]
