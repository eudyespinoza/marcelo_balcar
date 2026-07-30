import csv
import mimetypes
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from io import StringIO

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.models import Group, Permission
from django.contrib.auth.password_validation import validate_password
from django.db import connection, transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce, TruncDate, TruncMonth
from django.http import FileResponse, Http404, HttpResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema

from .models import Address, ApplicationSettings, AuditEvent, Client, DataIssue, Payment, PaymentMethod, PushSubscription, Service, ServiceEvent, ServicePhoto, SyncConflict, TechnicianProfile, User, normalize_digits
from .permissions import CanManageBilling, CanManageUsers, CanViewBilling, GROUP_SUPERADMIN, ReadModelPermission, RolePermission, assigned_services, can_operate_service, is_restricted_technician, scoped_services
from .realtime import publish_service_change
from .serializers import (
    AddressSerializer,
    ApplicationSettingsSerializer,
    ChangePasswordSerializer,
    ClientSerializer,
    CompleteServiceSerializer,
    CsrfSerializer,
    DailyCashSerializer,
    DataIssueSerializer,
    DashboardSerializer,
    HealthSerializer,
    LoginSerializer,
    PaymentMethodSerializer,
    PaymentSerializer,
    PermissionSerializer,
    PushSubscriptionSerializer,
    RoleSerializer,
    SessionSerializer,
    ServiceDetailSerializer,
    ServiceListSerializer,
    ServicePhotoSerializer,
    SyncBatchSerializer,
    SyncBatchResponseSerializer,
    SyncConflictSerializer,
    TechnicianSerializer,
    UserSummarySerializer,
    UserWriteSerializer,
)
from .services import apply_sync_operation, assign_service, arrive_service, cancel_service, complete_service, create_payment, find_overlaps, reopen_service, void_payment


def _require_perm(user, perm):
    if not (user.is_superuser or user.has_perm(perm)):
        from django.core.exceptions import PermissionDenied

        raise PermissionDenied("No tiene permiso para realizar esta acción.")


def _lock_identity(value):
    if value and connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [value])


def _check_client_identity_uniqueness(serializer, instance=None):
    phone = normalize_digits(serializer.validated_data.get("phone", getattr(instance, "phone", "")))
    dni = normalize_digits(serializer.validated_data.get("dni", getattr(instance, "dni", "")))
    _lock_identity(f"client-phone:{phone}")
    _lock_identity(f"client-dni:{dni}" if dni else "")
    queryset = Client.objects.exclude(pk=getattr(instance, "pk", None))
    from rest_framework.exceptions import ValidationError

    if queryset.filter(normalized_phone=phone).exists():
        raise ValidationError({"phone": "Ya existe un cliente con este teléfono."})
    if dni and queryset.filter(normalized_dni=dni).exists():
        raise ValidationError({"dni": "Ya existe un cliente con este DNI."})


def _ensure_photo_access(user, service):
    if can_operate_service(user, service):
        return
    if is_restricted_technician(user):
        has_offline_conflict = SyncConflict.objects.filter(
            service=service,
            operation__actor=user,
            resolved_at__isnull=True,
        ).exists()
        if not has_offline_conflict:
            from django.core.exceptions import PermissionDenied

            raise PermissionDenied("No puede adjuntar fotos a un servicio que no tiene asignado.")
        return
    _require_perm(user, "operations.add_servicephoto")


def _hash_photo(photo):
    if not photo.image:
        return
    import hashlib

    digest = hashlib.sha256()
    photo.image.open("rb")
    for chunk in photo.image.chunks():
        digest.update(chunk)
    photo.image.close()
    photo.checksum_sha256 = digest.hexdigest()
    photo.save(update_fields=["checksum_sha256", "updated_at"])


def _record_audit(actor, action, instance, metadata=None):
    AuditEvent.objects.create(
        actor=actor,
        action=action,
        object_type=instance.__class__.__name__,
        object_id=str(instance.pk),
        metadata=metadata or {},
    )


def _shift_month(value: date, months: int) -> date:
    month_index = value.year * 12 + value.month - 1 + months
    return date(month_index // 12, month_index % 12 + 1, 1)


def _money(value) -> str:
    return f"{Decimal(value or 0):.2f}"


def _dashboard_periods(start_date: date, end_date: date, granularity: str):
    if granularity == "month":
        current = start_date.replace(day=1)
        last = end_date.replace(day=1)
        while current <= last:
            yield current
            current = _shift_month(current, 1)
        return
    for offset in range((end_date - start_date).days + 1):
        yield start_date + timedelta(days=offset)


def _period_date(value):
    return value.date() if isinstance(value, datetime) else value


@extend_schema(responses=CsrfSerializer)
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
@ensure_csrf_cookie
def csrf_view(request):
    return Response({"csrfToken": get_token(request)})


@extend_schema(request=LoginSerializer, responses={200: UserSummarySerializer, 400: OpenApiResponse(description="Credenciales inválidas")})
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def login_view(request):
    user = authenticate(request, username=request.data.get("username", ""), password=request.data.get("password", ""))
    if not user:
        return Response({"detail": "Usuario o contraseña inválidos."}, status=status.HTTP_400_BAD_REQUEST)
    if not user.is_active:
        return Response({"detail": "La cuenta está inactiva."}, status=status.HTTP_403_FORBIDDEN)
    login(request, user)
    request.session["session_version"] = user.session_version
    return Response(UserSummarySerializer(user).data)


@extend_schema(request=None, responses={204: None})
@api_view(["POST"])
def logout_view(request):
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=ChangePasswordSerializer, responses={200: UserSummarySerializer, 400: OpenApiResponse(description="Contraseña inválida")})
@api_view(["POST"])
def change_password_view(request):
    current_password = request.data.get("current_password", "")
    new_password = request.data.get("new_password", "")
    if not request.user.check_password(current_password):
        return Response({"current_password": "La contraseña actual no es correcta."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        validate_password(new_password, request.user)
    except Exception as exc:
        messages = getattr(exc, "messages", [str(exc)])
        return Response({"new_password": messages}, status=status.HTTP_400_BAD_REQUEST)
    request.user.set_password(new_password)
    request.user.must_change_password = False
    request.user.session_version += 1
    request.user.save(update_fields=["password", "must_change_password", "session_version"])
    update_session_auth_hash(request, request.user)
    request.session["session_version"] = request.user.session_version
    return Response(UserSummarySerializer(request.user).data)


@extend_schema(responses=SessionSerializer)
@api_view(["GET"])
def session_view(request):
    return Response({"user": UserSummarySerializer(request.user).data, "vapid_public_key": settings.VAPID_PUBLIC_KEY})


class ApplicationSettingsView(APIView):
    def get_object(self):
        instance, _ = ApplicationSettings.objects.get_or_create(pk=1)
        return instance

    @extend_schema(responses=ApplicationSettingsSerializer)
    def get(self, request):
        return Response(ApplicationSettingsSerializer(self.get_object()).data)

    @extend_schema(request=ApplicationSettingsSerializer, responses=ApplicationSettingsSerializer)
    def patch(self, request):
        _require_perm(request.user, "operations.change_applicationsettings")
        instance = self.get_object()
        serializer = ApplicationSettingsSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _record_audit(request.user, "settings.update", instance, {"fields": list(serializer.validated_data)})
        return Response(ApplicationSettingsSerializer(instance).data)


class ClientViewSet(viewsets.ModelViewSet):
    serializer_class = ClientSerializer
    permission_classes = [ReadModelPermission]

    @extend_schema(parameters=[
        OpenApiParameter(
            name="is_delinquent",
            type=OpenApiTypes.BOOL,
            description="Filtra clientes segun su condicion de mora. Requiere permiso para ver datos sensibles.",
        ),
    ])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        queryset = Client.objects.annotate(addresses_total=Count("addresses", distinct=True), services_total=Count("services", distinct=True)).order_by("name", "id")
        if self.request.query_params.get("archived") == "only":
            _require_perm(self.request.user, "operations.restore_client")
            queryset = queryset.filter(archived_at__isnull=False)
        elif self.action not in ["restore"]:
            queryset = queryset.filter(archived_at__isnull=True)
        delinquency = self.request.query_params.get("is_delinquent")
        if delinquency is not None:
            _require_perm(self.request.user, "operations.view_client_sensitive")
            normalized_delinquency = delinquency.strip().lower()
            if normalized_delinquency not in {"true", "false"}:
                from rest_framework.exceptions import ValidationError

                raise ValidationError({"is_delinquent": "Debe indicar true o false."})
            queryset = queryset.filter(is_delinquent=normalized_delinquency == "true")
        query = self.request.query_params.get("q", "").strip()
        if query:
            digits = "".join(filter(str.isdigit, query))
            if connection.vendor == "postgresql":
                from django.contrib.postgres.search import TrigramSimilarity

                queryset = queryset.annotate(similarity=TrigramSimilarity("name", query))
                filters = Q(similarity__gt=0.15) | Q(name__unaccent__icontains=query) | Q(email__unaccent__icontains=query) | Q(addresses__full_text__unaccent__icontains=query)
            else:
                filters = Q(name__icontains=query) | Q(email__icontains=query) | Q(addresses__full_text__icontains=query)
            if digits:
                filters |= Q(normalized_phone__contains=digits) | Q(normalized_dni__contains=digits)
            queryset = queryset.filter(filters).distinct()
            if connection.vendor == "postgresql":
                queryset = queryset.order_by("-similarity", "name")
        if is_restricted_technician(self.request.user):
            service_ids = scoped_services(self.request.user).values_list("client_id", flat=True)
            queryset = queryset.filter(id__in=service_ids)
        return queryset

    def perform_create(self, serializer):
        _require_perm(self.request.user, "operations.add_client")
        _check_client_identity_uniqueness(serializer)
        instance = serializer.save()
        _record_audit(self.request.user, "client.create", instance)

    def perform_update(self, serializer):
        _require_perm(self.request.user, "operations.change_client")
        _check_client_identity_uniqueness(serializer, serializer.instance)
        instance = serializer.save()
        _record_audit(self.request.user, "client.update", instance, {"fields": list(serializer.validated_data)})

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            return super().update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        _require_perm(self.request.user, "operations.archive_client")
        if instance.legacy_locked:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("El cliente importado está bloqueado hasta el corte final.")
        instance.archived_at = timezone.now()
        instance.save(update_fields=["archived_at", "updated_at"])
        _record_audit(self.request.user, "client.archive", instance)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        _require_perm(request.user, "operations.restore_client")
        instance = Client.objects.get(pk=pk)
        instance.archived_at = None
        instance.save(update_fields=["archived_at", "updated_at"])
        _record_audit(request.user, "client.restore", instance)
        return Response(self.get_serializer(instance).data)


class AddressViewSet(viewsets.ModelViewSet):
    serializer_class = AddressSerializer
    permission_classes = [ReadModelPermission]

    def get_queryset(self):
        queryset = Address.objects.select_related("client")
        if self.request.query_params.get("archived") == "only":
            _require_perm(self.request.user, "operations.restore_address")
            queryset = queryset.filter(archived_at__isnull=False)
        elif self.action != "restore":
            queryset = queryset.filter(archived_at__isnull=True)
        client_id = self.request.query_params.get("client")
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        if is_restricted_technician(self.request.user):
            client_ids = scoped_services(self.request.user).values_list("client_id", flat=True)
            queryset = queryset.filter(client_id__in=client_ids)
        return queryset

    def perform_create(self, serializer):
        _require_perm(self.request.user, "operations.add_address")
        instance = serializer.save()
        _record_audit(self.request.user, "address.create", instance)

    def perform_update(self, serializer):
        _require_perm(self.request.user, "operations.change_address")
        instance = serializer.save()
        _record_audit(self.request.user, "address.update", instance, {"fields": list(serializer.validated_data)})

    def perform_destroy(self, instance):
        _require_perm(self.request.user, "operations.archive_address")
        if instance.legacy_locked:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("La dirección importada está bloqueada hasta el corte final.")
        instance.archived_at = timezone.now()
        instance.save(update_fields=["archived_at", "updated_at"])
        _record_audit(self.request.user, "address.archive", instance)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        _require_perm(request.user, "operations.restore_address")
        instance = Address.objects.get(pk=pk)
        instance.archived_at = None
        instance.save(update_fields=["archived_at", "updated_at"])
        _record_audit(request.user, "address.restore", instance)
        return Response(self.get_serializer(instance).data)


class TechnicianViewSet(viewsets.ModelViewSet):
    serializer_class = TechnicianSerializer
    queryset = TechnicianProfile.objects.select_related("user")
    permission_classes = [ReadModelPermission]

    def perform_create(self, serializer):
        _require_perm(self.request.user, "operations.manage_users")
        instance = serializer.save()
        _record_audit(self.request.user, "technician.create", instance)

    def perform_update(self, serializer):
        _require_perm(self.request.user, "operations.manage_users")
        instance = serializer.save()
        _record_audit(self.request.user, "technician.update", instance, {"fields": list(serializer.validated_data)})

    def perform_destroy(self, instance):
        _require_perm(self.request.user, "operations.manage_users")
        instance.active = False
        instance.save(update_fields=["active", "updated_at"])
        _record_audit(self.request.user, "technician.deactivate", instance)


class ServiceViewSet(viewsets.ModelViewSet):
    permission_classes = [ReadModelPermission]

    @extend_schema(parameters=[
        OpenApiParameter(
            name="assigned_to_me",
            type=OpenApiTypes.BOOL,
            description="Limita el resultado a los servicios asignados al perfil técnico de la sesión.",
        ),
    ])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def get_serializer_class(self):
        return ServiceDetailSerializer if self.action in ["retrieve", "history"] else ServiceListSerializer

    def get_queryset(self):
        queryset = Service.objects.select_related("client", "address", "assigned_technician").prefetch_related("photos", "events", "payments__method")
        if self.request.query_params.get("archived") == "only":
            _require_perm(self.request.user, "operations.archive_service")
            queryset = queryset.filter(archived_at__isnull=False)
        elif self.action != "restore":
            queryset = queryset.filter(archived_at__isnull=True)
        queryset = scoped_services(self.request.user, queryset)
        params = self.request.query_params
        if params.get("assigned_to_me", "").strip().lower() == "true":
            queryset = assigned_services(self.request.user, queryset)
        if params.get("client"):
            queryset = queryset.filter(client_id=params["client"])
        if params.get("technician"):
            queryset = queryset.filter(assigned_technician_id=params["technician"])
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("from"):
            queryset = queryset.filter(scheduled_at__gte=params["from"])
        if params.get("to"):
            queryset = queryset.filter(scheduled_at__lt=params["to"])
        return queryset

    def paginate_queryset(self, queryset):
        if self.request.query_params.get("client"):
            return None
        return super().paginate_queryset(queryset)

    def perform_create(self, serializer):
        _require_perm(self.request.user, "operations.add_service")
        service = serializer.save()
        overlaps = find_overlaps(service, service.assigned_technician, service.scheduled_at, service.scheduled_duration_minutes)
        override = bool(self.request.data.get("override_overlap"))
        if override:
            _require_perm(self.request.user, "operations.override_overlap")
        if overlaps and not override:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"overlap": [str(item.id) for item in overlaps]})
        publish_service_change(service, "created")
        if service.assigned_technician_id and service.assigned_technician.user_id:
            from .tasks import send_push

            transaction.on_commit(lambda: send_push.delay(
                [str(service.assigned_technician.user_id)],
                "Servicio asignado",
                "Tenés una nueva orden de servicio asignada.",
                f"/tecnico?service={service.id}",
            ))
        _record_audit(self.request.user, "service.create", service)

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            return super().create(request, *args, **kwargs)

    def perform_update(self, serializer):
        _require_perm(self.request.user, "operations.change_service")
        service = serializer.save()
        overlaps = find_overlaps(service, service.assigned_technician, service.scheduled_at, service.scheduled_duration_minutes)
        override = bool(self.request.data.get("override_overlap"))
        if override:
            _require_perm(self.request.user, "operations.override_overlap")
        if overlaps and not override:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"overlap": [str(item.id) for item in overlaps]})
        publish_service_change(service, "updated")
        _record_audit(self.request.user, "service.update", service, {"fields": list(serializer.validated_data)})

    def update(self, request, *args, **kwargs):
        # An overlap rejection must roll back the serializer save and its audit event.
        with transaction.atomic():
            return super().update(request, *args, **kwargs)

    def perform_destroy(self, instance):
        _require_perm(self.request.user, "operations.archive_service")
        if instance.legacy_locked:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("El servicio importado está bloqueado hasta el corte final.")
        instance.archived_at = timezone.now()
        instance.version += 1
        instance.save(update_fields=["archived_at", "version", "updated_at"])
        ServiceEvent.objects.create(service=instance, kind=ServiceEvent.Kind.ARCHIVED, actor=self.request.user)
        _record_audit(self.request.user, "service.archive", instance)
        publish_service_change(instance, "archived")

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        _require_perm(request.user, "operations.archive_service")
        instance = self.get_object()
        instance.archived_at = None
        instance.version += 1
        instance.save(update_fields=["archived_at", "version", "updated_at"])
        ServiceEvent.objects.create(service=instance, kind=ServiceEvent.Kind.RESTORED, actor=request.user)
        _record_audit(request.user, "service.restore", instance)
        return Response(ServiceDetailSerializer(instance, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        _require_perm(request.user, "operations.assign_service")
        service = self.get_object()
        technician = TechnicianProfile.objects.filter(pk=request.data.get("technician_id")).first() if request.data.get("technician_id") else None
        override = bool(request.data.get("override_overlap"))
        if override:
            _require_perm(request.user, "operations.override_overlap")
        service, overlaps = assign_service(service.pk, technician, request.user, override_overlap=override, reason=request.data.get("reason", ""))
        return Response({"service": ServiceDetailSerializer(service, context={"request": request}).data, "overlaps": [str(item.id) for item in overlaps]})

    @action(detail=True, methods=["post"])
    def arrive(self, request, pk=None):
        if not can_operate_service(request.user, self.get_object()):
            _require_perm(request.user, "operations.arrive_service")
        service = arrive_service(pk, request.user)
        return Response(ServiceDetailSerializer(service, context={"request": request}).data)

    @extend_schema(request=CompleteServiceSerializer, responses=ServiceDetailSerializer)
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        if not can_operate_service(request.user, self.get_object()):
            _require_perm(request.user, "operations.complete_service")
        serializer = CompleteServiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = complete_service(
            pk,
            request.user,
            serializer.validated_data["notes"],
            collected_amount=serializer.validated_data.get("collected_amount"),
        )
        return Response(ServiceDetailSerializer(service, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        _require_perm(request.user, "operations.cancel_service")
        service = cancel_service(self.get_object().pk, request.user, request.data.get("reason", ""))
        return Response(ServiceDetailSerializer(service, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        _require_perm(request.user, "operations.reopen_service")
        service = reopen_service(self.get_object().pk, request.user, request.data.get("reason", ""))
        return Response(ServiceDetailSerializer(service, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        service = self.get_object()
        return Response(ServiceDetailSerializer(service, context={"request": request}).data)

    @extend_schema(methods=["GET"], responses=ServicePhotoSerializer(many=True))
    @extend_schema(methods=["POST"], request=ServicePhotoSerializer, responses={200: ServicePhotoSerializer, 201: ServicePhotoSerializer})
    @action(detail=True, methods=["get", "post"], url_path="photos")
    def photos(self, request, pk=None):
        service = self.get_object()
        if request.method == "GET":
            return Response(ServicePhotoSerializer(service.photos.all(), many=True, context={"request": request}).data)
        operation_id = request.data.get("client_operation_id")
        if operation_id:
            existing = ServicePhoto.objects.filter(client_operation_id=operation_id).first()
            if existing:
                if existing.uploaded_by_id != request.user.id:
                    return Response({"detail": "El identificador idempotente ya fue utilizado."}, status=status.HTTP_409_CONFLICT)
                return Response(ServicePhotoSerializer(existing, context={"request": request}).data)
        _ensure_photo_access(request.user, service)
        data = request.data.copy()
        data["service"] = str(service.id)
        serializer = ServicePhotoSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        photo = serializer.save(uploaded_by=request.user)
        _hash_photo(photo)
        _record_audit(request.user, "service_photo.create", photo, {"service_id": str(service.id)})
        return Response(ServicePhotoSerializer(photo, context={"request": request}).data, status=status.HTTP_201_CREATED)


class ServicePhotoViewSet(viewsets.ModelViewSet):
    serializer_class = ServicePhotoSerializer
    permission_classes = [ReadModelPermission]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        return ServicePhoto.objects.filter(service__in=scoped_services(self.request.user))

    def create(self, request, *args, **kwargs):
        operation_id = request.data.get("client_operation_id")
        if operation_id:
            existing = ServicePhoto.objects.filter(client_operation_id=operation_id).first()
            if existing:
                if existing.uploaded_by_id != request.user.id:
                    return Response({"detail": "El identificador idempotente ya fue utilizado."}, status=status.HTTP_409_CONFLICT)
                return Response(self.get_serializer(existing).data)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        service = serializer.validated_data["service"]
        _ensure_photo_access(self.request.user, service)
        photo = serializer.save(uploaded_by=self.request.user)
        _hash_photo(photo)
        _record_audit(self.request.user, "service_photo.create", photo, {"service_id": str(service.id)})

    def perform_destroy(self, instance):
        if instance.uploaded_by_id != self.request.user.id or instance.service.status != Service.Status.IN_PROGRESS:
            _require_perm(self.request.user, "operations.delete_servicephoto")
        service_id = str(instance.service_id)
        photo_id = str(instance.id)
        instance.delete()
        AuditEvent.objects.create(actor=self.request.user, action="service_photo.delete", object_type="ServicePhoto", object_id=photo_id, metadata={"service_id": service_id})

    @action(detail=True, methods=["get"])
    def file(self, request, pk=None):
        photo = self.get_object()
        if not photo.image:
            raise Http404
        content_type = mimetypes.guess_type(photo.image.name)[0] or "application/octet-stream"
        return FileResponse(photo.image.open("rb"), content_type=content_type)


class PaymentMethodViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentMethodSerializer
    permission_classes = [CanViewBilling]

    def get_queryset(self):
        queryset = PaymentMethod.objects.all()
        return queryset if self.request.query_params.get("all") == "true" else queryset.filter(active=True)

    def perform_create(self, serializer):
        _require_perm(self.request.user, "operations.manage_billing")
        instance = serializer.save()
        _record_audit(self.request.user, "payment_method.create", instance)

    def perform_update(self, serializer):
        _require_perm(self.request.user, "operations.manage_billing")
        instance = serializer.save()
        _record_audit(self.request.user, "payment_method.update", instance, {"fields": list(serializer.validated_data)})

    def perform_destroy(self, instance):
        _require_perm(self.request.user, "operations.manage_billing")
        instance.active = False
        instance.save(update_fields=["active", "updated_at"])
        _record_audit(self.request.user, "payment_method.deactivate", instance)


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PaymentSerializer
    permission_classes = [CanViewBilling]

    def get_queryset(self):
        queryset = Payment.objects.select_related("service", "method", "recorded_by")
        if self.request.query_params.get("service"):
            queryset = queryset.filter(service_id=self.request.query_params["service"])
        return queryset

    def create(self, request, *args, **kwargs):
        _require_perm(request.user, "operations.manage_billing")
        serializer = PaymentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        payment = create_payment(
            serializer.validated_data["service"],
            request.user,
            amount=serializer.validated_data["amount"],
            method=serializer.validated_data["method"],
            paid_at=serializer.validated_data.get("paid_at"),
            note=serializer.validated_data.get("note", ""),
        )
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        _require_perm(request.user, "operations.manage_billing")
        return Response(PaymentSerializer(void_payment(pk, request.user, request.data.get("reason", ""))).data)


class DashboardTodayView(APIView):
    @extend_schema(responses=DashboardSerializer)
    def get(self, request):
        _require_perm(request.user, "operations.view_dashboard")
        today = timezone.localdate()
        range_end_date = parse_date(request.query_params.get("end_date", "")) or today
        range_start_date = parse_date(request.query_params.get("start_date", "")) or (range_end_date - timedelta(days=29))
        if range_start_date > range_end_date:
            raise ValidationError({"detail": "La fecha desde no puede ser posterior a la fecha hasta."})
        if (range_end_date - range_start_date).days > 3660:
            raise ValidationError({"detail": "El rango máximo permitido es de 10 años."})
        range_start = timezone.make_aware(datetime.combine(range_start_date, time.min))
        range_end = timezone.make_aware(datetime.combine(range_end_date + timedelta(days=1), time.min))
        granularity = "month" if (range_end_date - range_start_date).days > 62 else "day"
        start = timezone.make_aware(datetime.combine(today, time.min))
        end = start + timedelta(days=1)
        services = scoped_services(
            request.user,
            Service.objects.filter(archived_at__isnull=True, scheduled_at__gte=start, scheduled_at__lt=end)
            .select_related("client", "address", "assigned_technician")
            .order_by("scheduled_at"),
        )
        counts = {choice: services.filter(status=choice).count() for choice, _ in Service.Status.choices}
        counts["UNASSIGNED"] = services.filter(assigned_technician__isnull=True).count()
        counts["REVIEW"] = services.filter(requires_review=True).count()

        all_services = scoped_services(request.user, Service.objects.filter(archived_at__isnull=True))
        clients = Client.objects.filter(archived_at__isnull=True)
        if is_restricted_technician(request.user):
            clients = clients.filter(pk__in=all_services.values("client_id"))
        service_total = all_services.count()
        completed_total = all_services.filter(status=Service.Status.COMPLETED).count()
        completion_base = all_services.exclude(status=Service.Status.CANCELLED).count()
        overview = {
            "clients_total": clients.count(),
            "delinquent_clients": clients.filter(is_delinquent=True).count(),
            "active_users": User.objects.filter(is_active=True).count(),
            "active_technicians": TechnicianProfile.objects.filter(active=True).count(),
            "services_total": service_total,
            "unassigned_services": all_services.filter(assigned_technician__isnull=True).count(),
            "unscheduled_services": all_services.filter(scheduled_at__isnull=True).count(),
            "completion_rate": round(completed_total / completion_base * 100, 1) if completion_base else 0.0,
        }

        activity_filter = (
            Q(status=Service.Status.COMPLETED, completed_at__gte=range_start, completed_at__lt=range_end)
            | Q(status=Service.Status.COMPLETED, completed_at__isnull=True, scheduled_at__gte=range_start, scheduled_at__lt=range_end)
            | (~Q(status=Service.Status.COMPLETED) & Q(scheduled_at__gte=range_start, scheduled_at__lt=range_end))
        )
        range_services = all_services.filter(activity_filter)
        status_counts = dict(range_services.values_list("status").annotate(total=Count("id")))
        status_breakdown = [
            {"status": value, "label": label, "count": status_counts.get(value, 0)}
            for value, label in Service.Status.choices
        ]

        period_function = TruncMonth if granularity == "month" else TruncDate
        scheduled_rows = {
            _period_date(item["period"]): item
            for item in all_services.filter(scheduled_at__gte=range_start, scheduled_at__lt=range_end)
            .annotate(period=period_function("scheduled_at", tzinfo=timezone.get_current_timezone()))
            .values("period")
            .annotate(
                scheduled=Count("id"),
                cancelled=Count("id", filter=Q(status=Service.Status.CANCELLED)),
            )
        }
        completed_rows = {
            _period_date(item["period"]): item["completed"]
            for item in all_services.filter(status=Service.Status.COMPLETED, completed_at__gte=range_start, completed_at__lt=range_end)
            .annotate(period=period_function("completed_at", tzinfo=timezone.get_current_timezone()))
            .values("period")
            .annotate(completed=Count("id"))
        }
        service_trend = [
            {
                "date": period.isoformat(),
                "scheduled": scheduled_rows.get(period, {}).get("scheduled", 0),
                "completed": completed_rows.get(period, 0),
                "cancelled": scheduled_rows.get(period, {}).get("cancelled", 0),
            }
            for period in _dashboard_periods(range_start_date, range_end_date, granularity)
        ]

        workload_rows = (
            range_services.filter(assigned_technician__isnull=False)
            .values("assigned_technician_id", "assigned_technician__display_name")
            .annotate(
                total=Count("id"),
                completed=Count("id", filter=Q(status=Service.Status.COMPLETED)),
                open=Count("id", filter=Q(status__in=[Service.Status.PENDING, Service.Status.ASSIGNED, Service.Status.IN_PROGRESS])),
            )
            .order_by("-total", "assigned_technician__display_name")[:8]
        )
        technician_workload = [
            {
                "id": str(item["assigned_technician_id"]),
                "name": item["assigned_technician__display_name"],
                "total": item["total"],
                "completed": item["completed"],
                "open": item["open"],
            }
            for item in workload_rows
        ]

        finance = None
        revenue_trend = []
        payment_methods = []
        if request.user.is_superuser or request.user.has_perm("operations.view_billing"):
            billable_services = all_services.exclude(status=Service.Status.CANCELLED).filter(amount_due__isnull=False)
            billed_total = billable_services.aggregate(total=Sum("amount_due"))["total"] or Decimal("0.00")
            valid_payments = Payment.objects.filter(voided_at__isnull=True, service__in=billable_services)
            collected_total = valid_payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
            delinquent_services = billable_services.filter(client__is_delinquent=True)
            delinquent_billed = delinquent_services.aggregate(total=Sum("amount_due"))["total"] or Decimal("0.00")
            delinquent_collected = valid_payments.filter(service__in=delinquent_services).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
            current_month = today.replace(day=1)
            next_month = _shift_month(current_month, 1)
            month_start = timezone.make_aware(datetime.combine(current_month, time.min))
            month_end = timezone.make_aware(datetime.combine(next_month, time.min))
            collected_this_month = valid_payments.filter(paid_at__gte=month_start, paid_at__lt=month_end).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
            outstanding_total = max(billed_total - collected_total, Decimal("0.00"))
            finance = {
                "billed_total": _money(billed_total),
                "collected_total": _money(collected_total),
                "outstanding_total": _money(outstanding_total),
                "delinquent_balance": _money(max(delinquent_billed - delinquent_collected, Decimal("0.00"))),
                "collection_rate": round(collected_total / billed_total * 100, 1) if billed_total else 0.0,
                "collected_this_month": _money(collected_this_month),
            }

            range_payments = valid_payments.filter(paid_at__gte=range_start, paid_at__lt=range_end)
            payment_rows = {
                _period_date(item["period"]): item["total"]
                for item in range_payments
                .annotate(period=period_function("paid_at", tzinfo=timezone.get_current_timezone()))
                .values("period")
                .annotate(total=Sum("amount"))
            }
            revenue_trend = [
                {"date": period.isoformat(), "collected": _money(payment_rows.get(period))}
                for period in _dashboard_periods(range_start_date, range_end_date, granularity)
            ]
            payment_methods = [
                {"name": item["method__name"], "total": _money(item["total"]), "count": item["count"]}
                for item in range_payments.values("method__name")
                .annotate(total=Sum("amount"), count=Count("id"))
                .order_by("-total", "method__name")
            ]

        return Response({
            "date": today,
            "range": {
                "start": range_start_date.isoformat(),
                "end": range_end_date.isoformat(),
                "granularity": granularity,
            },
            "counts": counts,
            "services": ServiceListSerializer(services, many=True, context={"request": request}).data,
            "overview": overview,
            "finance": finance,
            "service_trend": service_trend,
            "revenue_trend": revenue_trend,
            "status_breakdown": status_breakdown,
            "technician_workload": technician_workload,
            "payment_methods": payment_methods,
        })


class CalendarEventsView(APIView):
    @extend_schema(
        parameters=[
            OpenApiParameter("start", OpenApiTypes.DATETIME), OpenApiParameter("end", OpenApiTypes.DATETIME),
            OpenApiParameter("technician", OpenApiTypes.UUID),
        ],
        responses=ServiceListSerializer(many=True),
    )
    def get(self, request):
        _require_perm(request.user, "operations.view_service")
        services = scoped_services(request.user, Service.objects.filter(archived_at__isnull=True).select_related("client", "assigned_technician"))
        if request.query_params.get("start"):
            services = services.filter(scheduled_at__gte=request.query_params["start"])
        if request.query_params.get("end"):
            services = services.filter(scheduled_at__lt=request.query_params["end"])
        if request.query_params.get("technician"):
            services = services.filter(assigned_technician_id=request.query_params["technician"])
        return Response(ServiceListSerializer(services, many=True, context={"request": request}).data)


class DailyCashView(APIView):
    permission_classes = [CanViewBilling]

    @extend_schema(
        parameters=[OpenApiParameter("date", OpenApiTypes.DATE), OpenApiParameter("export", OpenApiTypes.STR)],
        responses={
            (200, "application/json"): DailyCashSerializer,
            (200, "text/csv"): OpenApiTypes.BINARY,
        },
    )
    def get(self, request):
        _require_perm(request.user, "operations.view_daily_cash")
        date_value = request.query_params.get("date") or timezone.localdate().isoformat()
        selected = datetime.fromisoformat(date_value).date()
        start = timezone.make_aware(datetime.combine(selected, time.min))
        end = start + timedelta(days=1)
        payments = Payment.objects.filter(
            Q(paid_at__gte=start, paid_at__lt=end) | Q(voided_at__gte=start, voided_at__lt=end)
        ).select_related("method", "service__client", "recorded_by").distinct()
        inflows = Payment.objects.filter(paid_at__gte=start, paid_at__lt=end).select_related("method", "service__client", "recorded_by")
        reversals = Payment.objects.filter(voided_at__gte=start, voided_at__lt=end).select_related("method", "service__client", "recorded_by", "voided_by")
        if request.query_params.get("export") == "csv":
            response = HttpResponse(content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = f'attachment; filename="caja-{selected}.csv"'
            response.write("\ufeff")
            writer = csv.writer(response)
            writer.writerow(["Fecha", "Tipo", "Cliente", "Servicio", "Medio", "Importe", "Usuario"])
            safe = lambda value: f"'{value}" if str(value).startswith(("=", "+", "-", "@")) else value
            for payment in inflows:
                writer.writerow([timezone.localtime(payment.paid_at).strftime("%d/%m/%Y %H:%M"), "Cobro", safe(payment.service.client.name), safe(payment.service.description), safe(payment.method.name), payment.amount, safe(payment.recorded_by.username)])
            for payment in reversals:
                writer.writerow([timezone.localtime(payment.voided_at).strftime("%d/%m/%Y %H:%M"), "Anulación", safe(payment.service.client.name), safe(payment.service.description), safe(payment.method.name), -payment.amount, safe(payment.voided_by.username if payment.voided_by else "")])
            return response
        method_totals = {}
        for payment in inflows:
            item = method_totals.setdefault(payment.method.name, {"method__name": payment.method.name, "total": Decimal("0.00"), "movements": 0})
            item["total"] += payment.amount
            item["movements"] += 1
        for payment in reversals:
            item = method_totals.setdefault(payment.method.name, {"method__name": payment.method.name, "total": Decimal("0.00"), "movements": 0})
            item["total"] -= payment.amount
            item["movements"] += 1
        inflow_total = inflows.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        reversal_total = reversals.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        return Response({
            "date": selected,
            "total": inflow_total - reversal_total,
            "voided_total": reversal_total,
            "by_method": list(method_totals.values()),
            "payments": PaymentSerializer(payments, many=True).data,
        })


class SyncOperationsView(APIView):
    @extend_schema(request=SyncBatchSerializer, responses=SyncBatchResponseSerializer)
    def post(self, request):
        _require_perm(request.user, "operations.arrive_service")
        serializer = SyncBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        results = [apply_sync_operation(request.user, operation) for operation in serializer.validated_data["operations"]]
        return Response({"operations": results})


class SyncConflictViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SyncConflictSerializer
    queryset = SyncConflict.objects.select_related("service", "operation").filter(resolved_at__isnull=True)
    permission_classes = [ReadModelPermission]

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        _require_perm(request.user, "operations.change_syncconflict")
        conflict = self.get_object()
        resolution = (request.data.get("resolution") or "").strip()
        if not resolution:
            return Response({"detail": "Debe indicar una resolución."}, status=400)
        conflict.resolution = resolution
        conflict.resolved_by = request.user
        conflict.resolved_at = timezone.now()
        conflict.save(update_fields=["resolution", "resolved_by", "resolved_at", "updated_at"])
        if not conflict.service.conflicts.filter(resolved_at__isnull=True).exclude(pk=conflict.pk).exists():
            conflict.service.requires_review = False
            conflict.service.save(update_fields=["requires_review", "updated_at"])
        _record_audit(request.user, "sync_conflict.resolve", conflict, {"service_id": str(conflict.service_id)})
        return Response(self.get_serializer(conflict).data)


class DataIssueViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DataIssueSerializer
    queryset = DataIssue.objects.filter(resolved_at__isnull=True)
    permission_classes = [ReadModelPermission]

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        _require_perm(request.user, "operations.change_dataissue")
        issue = self.get_object()
        issue.resolved_by = request.user
        issue.resolved_at = timezone.now()
        issue.save(update_fields=["resolved_by", "resolved_at", "updated_at"])
        _record_audit(request.user, "data_issue.resolve", issue)
        return Response(self.get_serializer(issue).data)


class PushSubscriptionViewSet(mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = PushSubscriptionSerializer
    queryset = PushSubscription.objects.none()

    def get_queryset(self):
        return PushSubscription.objects.filter(user=self.request.user)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.prefetch_related("groups")
    permission_classes = [CanManageUsers]

    def get_serializer_class(self):
        return UserWriteSerializer if self.action in ["create", "update", "partial_update"] else UserSummarySerializer

    def _check(self):
        _require_perm(self.request.user, "operations.manage_users")

    def perform_create(self, serializer):
        self._check()
        if not self.request.user.is_superuser:
            requested = serializer.validated_data.get("groups", [])
            if any(group.name == GROUP_SUPERADMIN for group in requested):
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied("Solo un superusuario puede otorgar el rol Superadmin.")
            owned_permissions = self.request.user.get_all_permissions()
            requested_permissions = {f"{permission.content_type.app_label}.{permission.codename}" for group in requested for permission in group.permissions.all()}
            if not requested_permissions.issubset(owned_permissions):
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied("No puede otorgar permisos que su propia cuenta no posee.")
        instance = serializer.save()
        _record_audit(self.request.user, "user.create", instance, {"roles": list(instance.groups.values_list("name", flat=True))})

    def perform_update(self, serializer):
        self._check()
        target = self.get_object()
        if target == self.request.user and serializer.validated_data.get("is_active") is False:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("No puede desactivar su propia cuenta.")
        requested_groups = serializer.validated_data.get("groups")
        if requested_groups is not None and not self.request.user.is_superuser:
            if any(group.name == GROUP_SUPERADMIN for group in requested_groups):
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied("Solo un superusuario puede otorgar el rol Superadmin.")
            owned_permissions = set(self.request.user.get_all_permissions())
            requested_permissions = {f"{permission.content_type.app_label}.{permission.codename}" for group in requested_groups for permission in group.permissions.all()}
            if not requested_permissions.issubset(owned_permissions):
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied("No puede otorgar permisos que su propia cuenta no posee.")
        superadmin_group = Group.objects.get(name=GROUP_SUPERADMIN)
        removes_superadmin = requested_groups is not None and superadmin_group not in requested_groups
        disables_target = serializer.validated_data.get("is_active") is False
        if target.groups.filter(name=GROUP_SUPERADMIN).exists() and (removes_superadmin or disables_target):
            remaining = User.objects.filter(is_active=True, groups=superadmin_group).exclude(pk=target.pk).exists()
            if not remaining:
                from rest_framework.exceptions import ValidationError

                raise ValidationError("No puede desactivar o degradar al último Superadmin activo.")
        instance = serializer.save()
        _record_audit(self.request.user, "user.update", instance, {"fields": [field for field in serializer.validated_data if field != "password"], "password_reset": "password" in serializer.validated_data})

    def perform_destroy(self, instance):
        self._check()
        if instance == self.request.user:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("No puede eliminar su propia cuenta.")
        if instance.groups.filter(name=GROUP_SUPERADMIN).exists() and not User.objects.filter(is_active=True, groups__name=GROUP_SUPERADMIN).exclude(pk=instance.pk).exists():
            from rest_framework.exceptions import ValidationError

            raise ValidationError("No puede desactivar al último Superadmin activo.")
        instance.is_active = False
        instance.session_version += 1
        instance.save(update_fields=["is_active", "session_version"])
        _record_audit(self.request.user, "user.deactivate", instance)

    @action(detail=True, methods=["post"], url_path="revoke-sessions")
    def revoke_sessions(self, request, pk=None):
        self._check()
        target = self.get_object()
        target.session_version += 1
        target.save(update_fields=["session_version"])
        _record_audit(request.user, "user.revoke_sessions", target)
        # The version check revokes sessions on their next request. Expired rows remain harmless.
        return Response({"detail": "Sesiones revocadas."})


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Group.objects.prefetch_related("permissions")
    serializer_class = RoleSerializer
    permission_classes = [RolePermission]

    def _check(self):
        _require_perm(self.request.user, "operations.manage_roles")

    def perform_create(self, serializer):
        self._check()
        if serializer.validated_data.get("name") == GROUP_SUPERADMIN:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("El rol Superadmin ya es reservado del sistema.")
        instance = serializer.save()
        _record_audit(self.request.user, "role.create", instance)

    def perform_update(self, serializer):
        self._check()
        if self.get_object().name == GROUP_SUPERADMIN and not self.request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Solo un superusuario puede modificar este rol.")
        requested = serializer.validated_data.get("permissions")
        if requested is not None and not self.request.user.is_superuser:
            owned = self.request.user.get_all_permissions()
            requested_labels = {f"{permission.content_type.app_label}.{permission.codename}" for permission in requested}
            if not requested_labels.issubset(owned):
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied("No puede conceder permisos que su propia cuenta no posee.")
        instance = serializer.save()
        _record_audit(self.request.user, "role.update", instance, {"permissions_count": instance.permissions.count()})

    def perform_destroy(self, instance):
        self._check()
        if instance.name == GROUP_SUPERADMIN:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("El rol Superadmin no puede eliminarse.")
        role_id = str(instance.id)
        instance.delete()
        AuditEvent.objects.create(actor=self.request.user, action="role.delete", object_type="Group", object_id=role_id)


@extend_schema(responses=PermissionSerializer(many=True))
@api_view(["GET"])
def permissions_view(request):
    _require_perm(request.user, "operations.manage_roles")
    permissions_qs = Permission.objects.filter(content_type__app_label="operations").select_related("content_type").order_by("content_type__model", "codename")
    from .serializers import PermissionSerializer

    return Response(PermissionSerializer(permissions_qs, many=True).data)


@extend_schema(responses=HealthSerializer)
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def health_view(request):
    return Response({"status": "ok", "database": connection.vendor})
