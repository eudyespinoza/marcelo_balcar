from decimal import Decimal

from django.contrib.auth.models import Group, Permission
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from .models import (
    Address,
    ApplicationSettings,
    Client,
    DataIssue,
    Payment,
    PaymentMethod,
    PushSubscription,
    Service,
    ServiceEvent,
    ServicePhoto,
    SyncConflict,
    SyncOperation,
    TechnicianProfile,
    User,
    normalize_digits,
)
from .permissions import is_technician


class UserSummarySerializer(serializers.ModelSerializer):
    roles = serializers.SlugRelatedField(source="groups", many=True, slug_field="name", read_only=True)
    permissions = serializers.SerializerMethodField()
    is_technician = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "phone", "is_active", "must_change_password", "roles", "permissions", "is_technician"]

    def get_permissions(self, instance) -> list[str]:
        return sorted(instance.get_all_permissions())

    def get_is_technician(self, instance) -> bool:
        return is_technician(instance)


class UserWriteSerializer(serializers.ModelSerializer):
    role_ids = serializers.PrimaryKeyRelatedField(source="groups", queryset=Group.objects.all(), many=True, required=False)
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "phone", "password", "is_active", "must_change_password", "role_ids"]
        read_only_fields = ["must_change_password"]

    def validate_password(self, value):
        validate_password(value, self.instance)
        return value

    def create(self, validated_data):
        groups = validated_data.pop("groups", [])
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "Debe indicar una contraseña temporal."})
        user = User(**validated_data, must_change_password=True)
        user.set_password(password)
        user.save()
        user.groups.set(groups)
        return user

    def update(self, instance, validated_data):
        groups = validated_data.pop("groups", None)
        password = validated_data.pop("password", None)
        instance = super().update(instance, validated_data)
        if groups is not None:
            instance.groups.set(groups)
        if password:
            instance.set_password(password)
            instance.must_change_password = True
            instance.session_version += 1
            instance.save(update_fields=["password", "must_change_password", "session_version"])
        return instance


class PermissionSerializer(serializers.ModelSerializer):
    app = serializers.CharField(source="content_type.app_label", read_only=True)
    model = serializers.CharField(source="content_type.model", read_only=True)

    class Meta:
        model = Permission
        fields = ["id", "codename", "name", "app", "model"]


class RoleSerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)
    permission_ids = serializers.PrimaryKeyRelatedField(source="permissions", queryset=Permission.objects.filter(content_type__app_label="operations"), many=True, write_only=True, required=False)
    users_count = serializers.IntegerField(source="user_set.count", read_only=True)

    class Meta:
        model = Group
        fields = ["id", "name", "permissions", "permission_ids", "users_count"]


class ClientSerializer(serializers.ModelSerializer):
    addresses_count = serializers.IntegerField(source="addresses.count", read_only=True)
    services_count = serializers.IntegerField(source="services.count", read_only=True)

    class Meta:
        model = Client
        fields = [
            "id", "legacy_id", "name", "phone", "email", "dni", "is_delinquent", "condition",
            "legacy_duplicate_allowed", "legacy_locked", "archived_at", "addresses_count", "services_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["legacy_id", "legacy_duplicate_allowed", "legacy_locked", "archived_at"]

    def validate(self, attrs):
        instance = self.instance
        if instance and instance.legacy_locked:
            raise serializers.ValidationError("El registro importado está bloqueado hasta el corte final.")
        phone = normalize_digits(attrs.get("phone", getattr(instance, "phone", "")))
        dni = normalize_digits(attrs.get("dni", getattr(instance, "dni", "")))
        if not phone:
            raise serializers.ValidationError({"phone": "El teléfono es obligatorio."})
        queryset = Client.objects.exclude(pk=getattr(instance, "pk", None))
        if queryset.filter(normalized_phone=phone).exists():
            raise serializers.ValidationError({"phone": "Ya existe un cliente con este teléfono."})
        if dni and queryset.filter(normalized_dni=dni).exists():
            raise serializers.ValidationError({"dni": "Ya existe un cliente con este DNI."})
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request and not (request.user.is_superuser or request.user.has_perm("operations.view_client_sensitive")):
            for field in ["email", "dni", "is_delinquent", "condition", "legacy_duplicate_allowed", "legacy_locked"]:
                data.pop(field, None)
        return data


class ApplicationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicationSettings
        fields = ["base_message", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate_base_message(self, value):
        message = value.strip()
        if not message:
            raise serializers.ValidationError("El mensaje base no puede estar vacío.")
        return message


class AddressSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)

    class Meta:
        model = Address
        fields = ["id", "legacy_id", "client", "client_name", "full_text", "reference", "legacy_locked", "archived_at", "created_at", "updated_at"]
        read_only_fields = ["legacy_id", "legacy_locked", "archived_at"]

    def validate(self, attrs):
        if self.instance and self.instance.legacy_locked:
            raise serializers.ValidationError("La dirección importada está bloqueada hasta el corte final.")
        return attrs


class TechnicianSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = TechnicianProfile
        fields = ["id", "display_name", "aliases", "active", "user", "username", "legacy_id"]
        read_only_fields = ["legacy_id"]


class ServiceEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = ServiceEvent
        fields = ["id", "kind", "kind_label", "actor", "actor_name", "occurred_at", "reason", "payload"]

    def get_actor_name(self, instance) -> str:
        if not instance.actor:
            return "Sistema"
        return instance.actor.get_full_name() or instance.actor.username


class ServicePhotoSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ServicePhoto
        fields = ["id", "service", "client_operation_id", "image", "image_url", "checksum_sha256", "legacy_url", "caption", "captured_at", "uploaded_by", "created_at"]
        read_only_fields = ["checksum_sha256", "legacy_url", "uploaded_by"]
        extra_kwargs = {"image": {"write_only": True, "required": False}}

    def get_image_url(self, instance) -> str | None:
        request = self.context.get("request")
        if instance.image:
            url = f"/api/v1/service-photos/{instance.id}/file/"
            return request.build_absolute_uri(url) if request else url
        return instance.legacy_url or None

    def validate_image(self, value):
        if value and value.size > 15 * 1024 * 1024:
            raise serializers.ValidationError("La imagen no puede superar 15 MB.")
        return value

    def validate(self, attrs):
        if not self.instance and not attrs.get("image"):
            raise serializers.ValidationError({"image": "Debe adjuntar una imagen."})
        return attrs


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = ["id", "code", "name", "active", "sort_order"]


class PaymentSerializer(serializers.ModelSerializer):
    method_name = serializers.CharField(source="method.name", read_only=True)
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = ["id", "service", "amount", "method", "method_name", "paid_at", "note", "recorded_by", "recorded_by_name", "voided_at", "void_reason", "created_at"]
        read_only_fields = ["recorded_by", "voided_at", "void_reason"]

    def get_recorded_by_name(self, instance) -> str:
        return instance.recorded_by.get_full_name() or instance.recorded_by.username


class CompleteServiceSerializer(serializers.Serializer):
    notes = serializers.CharField(allow_blank=False, trim_whitespace=True)
    collected_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
        allow_null=True,
    )


class ServiceListSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)
    client_phone = serializers.CharField(source="client.phone", read_only=True)
    address_text = serializers.CharField(source="address.full_text", read_only=True, allow_null=True)
    technician_name = serializers.CharField(source="assigned_technician.display_name", read_only=True, allow_null=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    paid_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, allow_null=True)
    payment_status = serializers.CharField(read_only=True)
    actual_duration_minutes = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Service
        fields = [
            "id", "legacy_id", "client", "client_name", "client_phone", "address", "address_text",
            "address_snapshot", "scheduled_at", "scheduled_duration_minutes", "description", "admin_notes",
            "assigned_technician", "technician_name", "status", "status_label", "arrival_at", "completion_notes",
            "completed_at", "cancellation_reason", "amount_due", "paid_amount", "balance", "payment_status",
            "actual_duration_minutes", "version", "requires_review", "legacy_locked", "archived_at", "created_at", "updated_at",
        ]
        read_only_fields = ["legacy_id", "status", "arrival_at", "completed_at", "cancellation_reason", "version", "requires_review", "legacy_locked", "archived_at"]

    def validate(self, attrs):
        if self.instance and self.instance.legacy_locked:
            raise serializers.ValidationError("El servicio importado está bloqueado hasta el corte final.")
        instance = self.instance
        if instance and "assigned_technician" in attrs and attrs["assigned_technician"] != instance.assigned_technician:
            raise serializers.ValidationError({"assigned_technician": "Use la acción de asignación para conservar el historial."})
        client = attrs.get("client", getattr(instance, "client", None))
        address = attrs.get("address", getattr(instance, "address", None))
        if address and client and address.client_id != client.id:
            raise serializers.ValidationError({"address": "La dirección no pertenece al cliente seleccionado."})
        if self.instance and "amount_due" in attrs and attrs["amount_due"] is not None and attrs["amount_due"] < self.instance.paid_amount:
            raise serializers.ValidationError({"amount_due": "El importe no puede ser menor que lo cobrado."})
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        client = validated_data["client"]
        address = validated_data.get("address")
        technician = validated_data.pop("assigned_technician", None)
        service = Service.objects.create(
            **validated_data,
            assigned_technician=technician,
            status=Service.Status.ASSIGNED if technician else Service.Status.PENDING,
            client_name_snapshot=client.name,
            client_phone_snapshot=client.phone,
            address_snapshot=address.full_text if address else "",
            created_by=request.user,
            updated_by=request.user,
        )
        ServiceEvent.objects.create(service=service, kind=ServiceEvent.Kind.CREATED, actor=request.user)
        if technician:
            ServiceEvent.objects.create(
                service=service,
                kind=ServiceEvent.Kind.ASSIGNED,
                actor=request.user,
                payload={"from": "", "to": str(technician.id)},
            )
        return service

    def update(self, instance, validated_data):
        old_schedule = instance.scheduled_at
        old_duration = instance.scheduled_duration_minutes
        instance = super().update(instance, validated_data)
        if "client" in validated_data:
            instance.client_name_snapshot = instance.client.name
            instance.client_phone_snapshot = instance.client.phone
        if "address" in validated_data:
            instance.address_snapshot = instance.address.full_text if instance.address else ""
        instance.version += 1
        instance.updated_by = self.context["request"].user
        instance.save(update_fields=["client_name_snapshot", "client_phone_snapshot", "address_snapshot", "version", "updated_by", "updated_at"])
        if old_schedule != instance.scheduled_at or old_duration != instance.scheduled_duration_minutes:
            ServiceEvent.objects.create(
                service=instance,
                kind=ServiceEvent.Kind.RESCHEDULED,
                actor=self.context["request"].user,
                payload={"from": old_schedule.isoformat() if old_schedule else None, "to": instance.scheduled_at.isoformat() if instance.scheduled_at else None},
            )
            if instance.assigned_technician_id and instance.assigned_technician.user_id:
                from .tasks import send_push

                transaction.on_commit(lambda: send_push.delay(
                    [str(instance.assigned_technician.user_id)],
                    "Servicio reprogramado",
                    "Cambió el horario de una orden asignada. Revisá tu agenda.",
                    f"/tecnico?service={instance.id}",
                ))
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request and not (request.user.is_superuser or request.user.has_perm("operations.change_service")):
            for field in ["admin_notes", "legacy_locked"]:
                data.pop(field, None)
        if request and not (request.user.is_superuser or request.user.has_perm("operations.view_billing")):
            for field in ["amount_due", "paid_amount", "balance", "payment_status"]:
                data.pop(field, None)
        return data


class ServiceDetailSerializer(ServiceListSerializer):
    events = ServiceEventSerializer(many=True, read_only=True)
    photos = ServicePhotoSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)

    class Meta(ServiceListSerializer.Meta):
        fields = ServiceListSerializer.Meta.fields + ["events", "photos", "payments"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request and not (request.user.is_superuser or request.user.has_perm("operations.view_billing")):
            data.pop("payments", None)
        if request and not (request.user.is_superuser or request.user.has_perm("operations.view_servicephoto")):
            data.pop("photos", None)
        return data


class SyncOperationInputSerializer(serializers.Serializer):
    operation_id = serializers.UUIDField()
    service_id = serializers.UUIDField()
    type = serializers.ChoiceField(choices=SyncOperation.Type.choices)
    base_version = serializers.IntegerField(min_value=1)
    occurred_at = serializers.DateTimeField()
    payload = serializers.JSONField(required=False)


class SyncBatchSerializer(serializers.Serializer):
    operations = SyncOperationInputSerializer(many=True, max_length=50)


class SyncConflictSerializer(serializers.ModelSerializer):
    service_description = serializers.CharField(source="service.description", read_only=True)

    class Meta:
        model = SyncConflict
        fields = ["id", "operation", "service", "service_description", "reason", "evidence", "resolved_at", "resolved_by", "resolution", "created_at"]
        read_only_fields = ["operation", "service", "reason", "evidence", "resolved_at", "resolved_by"]


class PushSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushSubscription
        fields = ["id", "endpoint", "p256dh", "auth", "user_agent", "active"]

    def create(self, validated_data):
        subscription, _ = PushSubscription.objects.update_or_create(
            endpoint=validated_data["endpoint"],
            defaults={**validated_data, "user": self.context["request"].user, "active": True},
        )
        return subscription


class DataIssueSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataIssue
        fields = ["id", "source", "row_reference", "issue_type", "description", "payload", "resolved_at", "resolved_by", "created_at"]
        read_only_fields = ["source", "row_reference", "issue_type", "description", "payload", "resolved_at", "resolved_by"]


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)


class CsrfSerializer(serializers.Serializer):
    csrfToken = serializers.CharField()


class SessionSerializer(serializers.Serializer):
    user = UserSummarySerializer()
    vapid_public_key = serializers.CharField(allow_blank=True)


class DashboardSerializer(serializers.Serializer):
    date = serializers.DateField()
    range = serializers.DictField()
    counts = serializers.DictField(child=serializers.IntegerField())
    services = ServiceListSerializer(many=True)
    overview = serializers.DictField()
    finance = serializers.DictField(allow_null=True)
    service_trend = serializers.ListField(child=serializers.DictField())
    revenue_trend = serializers.ListField(child=serializers.DictField())
    status_breakdown = serializers.ListField(child=serializers.DictField())
    technician_workload = serializers.ListField(child=serializers.DictField())
    payment_methods = serializers.ListField(child=serializers.DictField())


class DailyCashSerializer(serializers.Serializer):
    date = serializers.DateField()
    total = serializers.DecimalField(max_digits=14, decimal_places=2)
    voided_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    by_method = serializers.ListField(child=serializers.DictField())
    payments = PaymentSerializer(many=True)


class SyncBatchResponseSerializer(serializers.Serializer):
    operations = serializers.ListField(child=serializers.DictField())


class HealthSerializer(serializers.Serializer):
    status = serializers.CharField()
    database = serializers.CharField()
