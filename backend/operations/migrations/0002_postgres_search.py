from django.db import migrations


def enable_search(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    statements = [
        "CREATE EXTENSION IF NOT EXISTS pg_trgm",
        "CREATE EXTENSION IF NOT EXISTS unaccent",
        "CREATE INDEX IF NOT EXISTS client_name_trgm_idx ON operations_client USING gin (name gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS address_text_trgm_idx ON operations_address USING gin (full_text gin_trgm_ops)",
    ]
    with schema_editor.connection.cursor() as cursor:
        for statement in statements:
            cursor.execute(statement)


def disable_search(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("DROP INDEX IF EXISTS client_name_trgm_idx")
        cursor.execute("DROP INDEX IF EXISTS address_text_trgm_idx")


class Migration(migrations.Migration):
    dependencies = [("operations", "0001_initial")]
    operations = [migrations.RunPython(enable_search, disable_search)]
