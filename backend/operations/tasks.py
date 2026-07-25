import json

from celery import shared_task
from django.conf import settings
from pywebpush import WebPushException, webpush

from .models import PushSubscription


@shared_task
def send_push(user_ids, title, body, url="/"):
    if not settings.PUSH_ENABLED:
        return {"sent": 0, "disabled": True}
    sent = 0
    for subscription in PushSubscription.objects.filter(user_id__in=user_ids, active=True):
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=json.dumps({"title": title, "body": body, "url": url}),
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
            )
            sent += 1
        except WebPushException as exc:
            if getattr(exc.response, "status_code", None) in {404, 410}:
                subscription.active = False
                subscription.save(update_fields=["active", "updated_at"])
    return {"sent": sent}

