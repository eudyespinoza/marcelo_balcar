from django.db import migrations, models


DEFAULT_BASE_MESSAGE = (
    "Hola! Te escribimos desde Marcelo Balcar Automatizaciones para avisarte que "
    "Marcelo se encuentra afuera de tu domicilio. Saludos Mariana"
)


def create_default_settings(apps, schema_editor):
    ApplicationSettings = apps.get_model("operations", "ApplicationSettings")
    ApplicationSettings.objects.get_or_create(pk=1, defaults={"base_message": DEFAULT_BASE_MESSAGE})


def remove_default_settings(apps, schema_editor):
    ApplicationSettings = apps.get_model("operations", "ApplicationSettings")
    ApplicationSettings.objects.filter(pk=1).delete()


class Migration(migrations.Migration):
    dependencies = [("operations", "0006_sensitive_and_photo_role_permissions")]

    operations = [
        migrations.CreateModel(
            name="ApplicationSettings",
            fields=[
                ("id", models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
                ("base_message", models.TextField(default=DEFAULT_BASE_MESSAGE, max_length=500)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "configuración de la aplicación",
                "verbose_name_plural": "configuración de la aplicación",
            },
        ),
        migrations.RunPython(create_default_settings, remove_default_settings),
    ]
