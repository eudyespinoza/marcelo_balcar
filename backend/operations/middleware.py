from django.contrib.auth import logout
from django.http import JsonResponse


class SessionPolicyMiddleware:
    """Revokes old sessions and enforces the first password change at API level."""

    PASSWORD_CHANGE_ALLOWED = {
        "/api/v1/auth/session/",
        "/api/v1/auth/logout/",
        "/api/v1/auth/change-password/",
        "/api/v1/auth/csrf/",
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            stored_version = request.session.get("session_version")
            if stored_version is None:
                request.session["session_version"] = user.session_version
            elif stored_version != user.session_version:
                logout(request)
                return JsonResponse({"detail": "La sesión fue revocada.", "code": "session_revoked"}, status=401)
            if request.path.startswith("/api/v1/") and user.must_change_password and request.path not in self.PASSWORD_CHANGE_ALLOWED:
                return JsonResponse(
                    {"detail": "Debe cambiar la contraseña temporal antes de continuar.", "code": "password_change_required"},
                    status=403,
                )
        return self.get_response(request)
