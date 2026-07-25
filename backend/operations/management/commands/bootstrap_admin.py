import os

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError

from operations.models import User
from operations.permissions import GROUP_SUPERADMIN


class Command(BaseCommand):
    help = "Crea o actualiza el primer superadministrador desde variables de entorno."

    def handle(self, *args, **options):
        username = os.getenv("BOOTSTRAP_ADMIN_USERNAME")
        password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD")
        if not username or not password:
            raise CommandError("Defina BOOTSTRAP_ADMIN_USERNAME y BOOTSTRAP_ADMIN_PASSWORD.")
        user, created = User.objects.get_or_create(username=username, defaults={"is_active": True, "is_staff": True, "is_superuser": True})
        if not created:
            self.stdout.write(self.style.WARNING(f"La cuenta {username} ya existe; bootstrap no modificó permisos ni contraseña."))
            return
        user.must_change_password = True
        user.set_password(password)
        user.save()
        group = Group.objects.get(name=GROUP_SUPERADMIN)
        user.groups.add(group)
        self.stdout.write(self.style.SUCCESS(f"Superadministrador listo: {username}"))
