from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AddressViewSet,
    ApplicationSettingsView,
    CalendarEventsView,
    ClientViewSet,
    DailyCashView,
    DashboardTodayView,
    DataIssueViewSet,
    PaymentMethodViewSet,
    PaymentViewSet,
    PushSubscriptionViewSet,
    RoleViewSet,
    ServicePhotoViewSet,
    ServiceViewSet,
    SyncConflictViewSet,
    SyncOperationsView,
    TechnicianViewSet,
    UserViewSet,
    csrf_view,
    change_password_view,
    health_view,
    login_view,
    logout_view,
    permissions_view,
    session_view,
)

router = DefaultRouter()
router.register("clients", ClientViewSet, basename="client")
router.register("addresses", AddressViewSet, basename="address")
router.register("technicians", TechnicianViewSet, basename="technician")
router.register("services", ServiceViewSet, basename="service")
router.register("service-photos", ServicePhotoViewSet, basename="service-photo")
router.register("payment-methods", PaymentMethodViewSet, basename="payment-method")
router.register("payments", PaymentViewSet, basename="payment")
router.register("sync-conflicts", SyncConflictViewSet, basename="sync-conflict")
router.register("data-issues", DataIssueViewSet, basename="data-issue")
router.register("push-subscriptions", PushSubscriptionViewSet, basename="push-subscription")
router.register("users", UserViewSet, basename="user")
router.register("roles", RoleViewSet, basename="role")

urlpatterns = [
    path("auth/csrf/", csrf_view),
    path("auth/login/", login_view),
    path("auth/change-password/", change_password_view),
    path("auth/logout/", logout_view),
    path("auth/session/", session_view),
    path("settings/", ApplicationSettingsView.as_view()),
    path("calendar/events/", CalendarEventsView.as_view()),
    path("dashboard/today/", DashboardTodayView.as_view()),
    path("reports/daily-cash/", DailyCashView.as_view()),
    path("sync/operations/", SyncOperationsView.as_view()),
    path("permissions/", permissions_view),
    path("health/", health_view),
] + router.urls
