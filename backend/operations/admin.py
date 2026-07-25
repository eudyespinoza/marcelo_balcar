from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    Address,
    AuditEvent,
    Client,
    DataIssue,
    MigrationRun,
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
)

admin.site.register(User, UserAdmin)
for model in [Client, Address, TechnicianProfile, Service, ServiceEvent, ServicePhoto, PaymentMethod, Payment, SyncOperation, SyncConflict, PushSubscription, AuditEvent, MigrationRun, DataIssue]:
    admin.site.register(model)

