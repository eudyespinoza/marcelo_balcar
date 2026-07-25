from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Service, TechnicianProfile

GROUP_SUPERADMIN = "Superadmin"
GROUP_ADMIN = "Administrador"
GROUP_COORDINATOR = "Coordinador"
GROUP_TECHNICIAN = "Técnico"


def in_group(user, name):
    return bool(user and user.is_authenticated and user.groups.filter(name=name).exists())


def is_technician(user):
    if not user or not user.is_authenticated or user.is_superuser:
        return False
    if in_group(user, GROUP_TECHNICIAN):
        return True
    try:
        user.technician_profile
    except (AttributeError, TechnicianProfile.DoesNotExist):
        return False
    return True


def get_technician_profile(user) -> TechnicianProfile | None:
    try:
        profile = user.technician_profile
    except (AttributeError, TechnicianProfile.DoesNotExist):
        return None
    return profile if profile.active else None


def can_operate_service(user, service: Service):
    if user.is_superuser:
        return True
    if not is_technician(user):
        return user.has_perm("operations.change_service")
    profile = get_technician_profile(user)
    return bool(profile and service.assigned_technician_id == profile.id and service.archived_at is None)


def scoped_services(user, queryset=None):
    queryset = queryset if queryset is not None else Service.objects.all()
    if user.is_superuser or not is_technician(user):
        return queryset
    profile = get_technician_profile(user)
    return queryset.filter(assigned_technician=profile) if profile else queryset.none()


class HasModelPermission(BasePermission):
    permission = ""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.is_superuser or request.user.has_perm(self.permission)))


class CanViewBilling(HasModelPermission):
    permission = "operations.view_billing"


class CanManageBilling(HasModelPermission):
    permission = "operations.manage_billing"


class ReadModelPermission(BasePermission):
    """Requires the Django view permission for reads; mutations keep explicit business checks."""

    def has_permission(self, request, view):
        if request.method not in SAFE_METHODS:
            return True
        queryset = getattr(view, "queryset", None)
        model = getattr(queryset, "model", None)
        if model is None:
            try:
                model = view.get_serializer_class().Meta.model
            except (AttributeError, TypeError):
                return False
        permission = f"{model._meta.app_label}.view_{model._meta.model_name}"
        return request.user.is_superuser or request.user.has_perm(permission)


class CanManageUsers(HasModelPermission):
    permission = "operations.manage_users"


class CanManageRoles(HasModelPermission):
    permission = "operations.manage_roles"


class RolePermission(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user.is_superuser or request.user.has_perm("operations.manage_roles") or request.user.has_perm("operations.manage_users")
        return request.user.is_superuser or request.user.has_perm("operations.manage_roles")
