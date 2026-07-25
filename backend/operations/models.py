import uuid
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q, Sum
from django.utils import timezone


def normalize_digits(value: str | None) -> str:
    return "".join(character for character in (value or "") if character.isdigit())


class UUIDModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ArchivableModel(UUIDModel):
    archived_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        abstract = True

    @property
    def is_archived(self):
        return self.archived_at is not None


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=32, blank=True)
    must_change_password = models.BooleanField(default=True)
    session_version = models.PositiveIntegerField(default=1)

    class Meta(AbstractUser.Meta):
        permissions = [
            ("manage_users", "Puede administrar usuarios"),
            ("manage_roles", "Puede administrar roles y permisos"),
        ]


class ApplicationSettings(models.Model):
    DEFAULT_BASE_MESSAGE = (
        "Hola! Te escribimos desde Marcelo Balcar Automatizaciones para avisarte que "
        "Marcelo se encuentra afuera de tu domicilio. Saludos Mariana"
    )

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    base_message = models.TextField(max_length=500, default=DEFAULT_BASE_MESSAGE)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "configuración de la aplicación"
        verbose_name_plural = "configuración de la aplicación"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)


class Client(ArchivableModel):
    legacy_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    name = models.CharField(max_length=180, db_index=True)
    phone = models.CharField(max_length=32)
    normalized_phone = models.CharField(max_length=32, db_index=True, editable=False)
    email = models.EmailField(blank=True)
    dni = models.CharField(max_length=32, blank=True)
    normalized_dni = models.CharField(max_length=32, blank=True, db_index=True, editable=False)
    is_delinquent = models.BooleanField(default=False)
    condition = models.CharField(max_length=200, blank=True)
    legacy_duplicate_allowed = models.BooleanField(default=False)
    legacy_locked = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["normalized_phone", "archived_at"]),
            models.Index(fields=["normalized_dni", "archived_at"]),
        ]
        permissions = [
            ("archive_client", "Puede archivar clientes"),
            ("restore_client", "Puede restaurar clientes"),
            ("view_client_sensitive", "Puede ver datos sensibles de clientes"),
        ]

    def clean(self):
        self.normalized_phone = normalize_digits(self.phone)
        self.normalized_dni = normalize_digits(self.dni)
        if not self.normalized_phone:
            raise ValidationError({"phone": "El teléfono es obligatorio."})
        if not self.legacy_duplicate_allowed:
            phone_match = Client.objects.exclude(pk=self.pk).filter(normalized_phone=self.normalized_phone).exists()
            if phone_match:
                raise ValidationError({"phone": "Ya existe un cliente con este teléfono."})
            if self.normalized_dni and Client.objects.exclude(pk=self.pk).filter(normalized_dni=self.normalized_dni).exists():
                raise ValidationError({"dni": "Ya existe un cliente con este DNI."})

    def save(self, *args, **kwargs):
        self.normalized_phone = normalize_digits(self.phone)
        self.normalized_dni = normalize_digits(self.dni)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Address(ArchivableModel):
    legacy_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    client = models.ForeignKey(Client, related_name="addresses", on_delete=models.PROTECT)
    full_text = models.CharField(max_length=320, db_index=True)
    reference = models.CharField(max_length=240, blank=True)
    legacy_locked = models.BooleanField(default=False)

    class Meta:
        ordering = ["full_text"]
        permissions = [
            ("archive_address", "Puede archivar direcciones"),
            ("restore_address", "Puede restaurar direcciones"),
        ]

    def __str__(self):
        return self.full_text


class TechnicianProfile(UUIDModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        related_name="technician_profile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    legacy_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    display_name = models.CharField(max_length=180, db_index=True)
    aliases = models.JSONField(default=list, blank=True)
    active = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ["display_name"]

    def __str__(self):
        return self.display_name


class Service(ArchivableModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pendiente"
        ASSIGNED = "ASSIGNED", "Asignado"
        IN_PROGRESS = "IN_PROGRESS", "En curso"
        COMPLETED = "COMPLETED", "Finalizado"
        CANCELLED = "CANCELLED", "Cancelado"

    legacy_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    legacy_row_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    client = models.ForeignKey(Client, related_name="services", on_delete=models.PROTECT)
    address = models.ForeignKey(Address, related_name="services", on_delete=models.PROTECT, null=True, blank=True)
    client_name_snapshot = models.CharField(max_length=180, blank=True)
    client_phone_snapshot = models.CharField(max_length=32, blank=True)
    address_snapshot = models.CharField(max_length=320, blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True, db_index=True)
    scheduled_duration_minutes = models.PositiveSmallIntegerField(default=60)
    description = models.CharField(max_length=500)
    admin_notes = models.TextField(blank=True)
    assigned_technician = models.ForeignKey(
        TechnicianProfile,
        related_name="services",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    arrival_at = models.DateTimeField(null=True, blank=True)
    completion_notes = models.TextField(blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True)
    amount_due = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    requires_review = models.BooleanField(default=False, db_index=True)
    legacy_locked = models.BooleanField(default=False)
    legacy_raw_timestamps = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="services_created",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="services_updated",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-scheduled_at", "-created_at"]
        indexes = [
            models.Index(fields=["scheduled_at", "status"]),
            models.Index(fields=["assigned_technician", "scheduled_at"]),
        ]
        permissions = [
            ("assign_service", "Puede asignar servicios"),
            ("arrive_service", "Puede marcar llegada"),
            ("complete_service", "Puede finalizar servicios"),
            ("cancel_service", "Puede cancelar servicios"),
            ("reopen_service", "Puede reabrir servicios"),
            ("override_overlap", "Puede confirmar solapamientos"),
            ("archive_service", "Puede archivar servicios"),
            ("view_dashboard", "Puede ver el tablero operativo"),
        ]

    @property
    def paid_amount(self):
        return self.payments.filter(voided_at__isnull=True).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    @property
    def balance(self):
        if self.amount_due is None:
            return None
        return max(self.amount_due - self.paid_amount, Decimal("0.00"))

    @property
    def payment_status(self):
        if self.amount_due is None:
            return "UNBILLED"
        if self.paid_amount <= 0:
            return "PENDING"
        if self.paid_amount < self.amount_due:
            return "PARTIAL"
        return "PAID"

    @property
    def actual_duration_minutes(self):
        if not self.arrival_at or not self.completed_at:
            return None
        return max(round((self.completed_at - self.arrival_at).total_seconds() / 60), 0)

    def clean(self):
        if self.scheduled_duration_minutes < 15 or self.scheduled_duration_minutes > 720:
            raise ValidationError({"scheduled_duration_minutes": "La duración debe estar entre 15 y 720 minutos."})
        if self.amount_due is not None and self.amount_due < 0:
            raise ValidationError({"amount_due": "El importe no puede ser negativo."})
        if self.pk and self.amount_due is not None and self.amount_due < self.paid_amount:
            raise ValidationError({"amount_due": "El importe no puede ser menor que lo ya cobrado."})

    def __str__(self):
        return f"{self.client_name_snapshot or self.client.name}: {self.description}"


class ServiceEvent(UUIDModel):
    class Kind(models.TextChoices):
        CREATED = "CREATED", "Creado"
        ASSIGNED = "ASSIGNED", "Asignado"
        REASSIGNED = "REASSIGNED", "Reasignado"
        RESCHEDULED = "RESCHEDULED", "Reprogramado"
        ARRIVED = "ARRIVED", "Llegada"
        NOTE_ADDED = "NOTE_ADDED", "Observación"
        COMPLETED = "COMPLETED", "Finalizado"
        CANCELLED = "CANCELLED", "Cancelado"
        REOPENED = "REOPENED", "Reabierto"
        ARCHIVED = "ARCHIVED", "Archivado"
        RESTORED = "RESTORED", "Restaurado"
        CONFLICT = "CONFLICT", "Conflicto"

    service = models.ForeignKey(Service, related_name="events", on_delete=models.CASCADE)
    kind = models.CharField(max_length=24, choices=Kind.choices, db_index=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)
    reason = models.TextField(blank=True)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["occurred_at", "created_at"]


def service_photo_path(instance, filename):
    return f"services/{instance.service_id}/{instance.id}-{filename}"


class ServicePhoto(UUIDModel):
    service = models.ForeignKey(Service, related_name="photos", on_delete=models.CASCADE)
    client_operation_id = models.UUIDField(unique=True, null=True, blank=True, db_index=True)
    image = models.ImageField(upload_to=service_photo_path, null=True, blank=True)
    checksum_sha256 = models.CharField(max_length=64, blank=True, db_index=True)
    legacy_url = models.URLField(max_length=1000, blank=True)
    caption = models.CharField(max_length=240, blank=True)
    captured_at = models.DateTimeField(null=True, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)


class PaymentMethod(UUIDModel):
    code = models.SlugField(max_length=32, unique=True)
    name = models.CharField(max_length=80)
    active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class Payment(UUIDModel):
    service = models.ForeignKey(Service, related_name="payments", on_delete=models.PROTECT)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.ForeignKey(PaymentMethod, related_name="payments", on_delete=models.PROTECT)
    paid_at = models.DateTimeField(default=timezone.now, db_index=True)
    note = models.CharField(max_length=300, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="payments_recorded", on_delete=models.PROTECT)
    voided_at = models.DateTimeField(null=True, blank=True, db_index=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="payments_voided",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    void_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-paid_at", "-created_at"]
        permissions = [
            ("view_billing", "Puede ver importes y cobros"),
            ("manage_billing", "Puede registrar y anular cobros"),
            ("view_daily_cash", "Puede ver la caja diaria"),
        ]

    def clean(self):
        if self.amount <= 0:
            raise ValidationError({"amount": "El pago debe ser mayor que cero."})
        if not self.service.amount_due:
            raise ValidationError({"service": "El servicio debe tener un importe total antes de cobrar."})
        other_paid = self.service.payments.filter(voided_at__isnull=True).exclude(pk=self.pk).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        if other_paid + self.amount > self.service.amount_due:
            raise ValidationError({"amount": "El pago supera el saldo del servicio."})


class SyncOperation(UUIDModel):
    class Type(models.TextChoices):
        ARRIVE = "ARRIVE", "Llegada"
        ADD_NOTE = "ADD_NOTE", "Agregar observación"
        COMPLETE = "COMPLETE", "Finalizar"

    class Status(models.TextChoices):
        APPLIED = "APPLIED", "Aplicada"
        DUPLICATE = "DUPLICATE", "Duplicada"
        CONFLICT = "CONFLICT", "Conflicto"
        FAILED = "FAILED", "Fallida"

    operation_id = models.UUIDField(unique=True, db_index=True)
    service = models.ForeignKey(Service, related_name="sync_operations", on_delete=models.CASCADE)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    operation_type = models.CharField(max_length=20, choices=Type.choices)
    base_version = models.PositiveIntegerField()
    occurred_at = models.DateTimeField()
    received_at = models.DateTimeField(default=timezone.now)
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices)
    result = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["received_at"]


class SyncConflict(UUIDModel):
    operation = models.OneToOneField(SyncOperation, related_name="conflict", on_delete=models.CASCADE)
    service = models.ForeignKey(Service, related_name="conflicts", on_delete=models.CASCADE)
    reason = models.CharField(max_length=300)
    evidence = models.JSONField(default=dict, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    resolution = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]


class PushSubscription(UUIDModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="push_subscriptions", on_delete=models.CASCADE)
    endpoint = models.URLField(max_length=1000, unique=True)
    p256dh = models.TextField()
    auth = models.TextField()
    user_agent = models.CharField(max_length=500, blank=True)
    active = models.BooleanField(default=True)


class AuditEvent(UUIDModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=100, db_index=True)
    object_type = models.CharField(max_length=100, db_index=True)
    object_id = models.CharField(max_length=64, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class MigrationRun(UUIDModel):
    class Mode(models.TextChoices):
        PRECUTOVER = "precutover", "Pre-corte"
        FINAL = "final", "Final"

    mode = models.CharField(max_length=20, choices=Mode.choices)
    source_path = models.CharField(max_length=500)
    dry_run = models.BooleanField(default=False)
    status = models.CharField(max_length=20, default="RUNNING")
    counts = models.JSONField(default=dict, blank=True)
    report_path = models.CharField(max_length=500, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)


class DataIssue(UUIDModel):
    source = models.CharField(max_length=80, db_index=True)
    row_reference = models.CharField(max_length=100, blank=True, db_index=True)
    issue_type = models.CharField(max_length=100, db_index=True)
    description = models.TextField()
    payload = models.JSONField(default=dict, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
