import csv
import hashlib
import json
import mimetypes
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import requests
from django.contrib.auth.models import Group
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from operations.models import (
    Address,
    Client,
    DataIssue,
    MigrationRun,
    Service,
    ServicePhoto,
    TechnicianProfile,
    User,
    normalize_digits,
)
from operations.permissions import GROUP_ADMIN, GROUP_SUPERADMIN

ARGENTINA = ZoneInfo("America/Argentina/Buenos_Aires")


def clean(value):
    return (value or "").strip()


def normalized_text(value):
    return " ".join(clean(value).casefold().split())


def read_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_legacy_wall_time(value):
    """Glide wrote Z but rendered the same wall clock; preserve that visible time."""
    value = clean(value)
    if not value or value == "00:00":
        return None
    try:
        raw = value[:-1] if value.endswith("Z") else value
        parsed = datetime.fromisoformat(raw)
        return parsed.replace(tzinfo=ARGENTINA)
    except ValueError:
        return None


class DryRunComplete(Exception):
    pass


class Command(BaseCommand):
    help = "Importa de forma idempotente la exportación CSV de Glide."

    def add_arguments(self, parser):
        parser.add_argument("--source", type=Path, required=True)
        parser.add_argument("--mode", choices=["precutover", "final"], default="precutover")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--skip-media", action="store_true")
        parser.add_argument("--force-legacy-refresh", action="store_true")
        parser.add_argument("--report-dir", type=Path, default=Path("var/import-reports"))

    def handle(self, *args, **options):
        source = options["source"].resolve()
        required = ["CLIENTES.csv", "DIRECCIONES.csv", "SERVICIOS.csv", "TECNICOS.csv", "Users.csv"]
        missing = [name for name in required if not (source / name).exists()]
        if missing:
            raise CommandError(f"Faltan archivos: {', '.join(missing)}")
        if MigrationRun.objects.filter(mode=MigrationRun.Mode.FINAL, status="COMPLETED").exists() and not options["force_legacy_refresh"]:
            raise CommandError("La migración final ya fue sellada. Use --force-legacy-refresh solo con respaldo y autorización.")

        self.counts = Counter()
        self.issue_rows = []
        self.source = source
        self.dry_run = options["dry_run"]
        self.skip_media = options["skip_media"] or self.dry_run
        self.legacy_locked = options["mode"] == "precutover"
        report = None

        try:
            with transaction.atomic():
                run = MigrationRun.objects.create(mode=options["mode"], source_path=str(source), dry_run=self.dry_run)
                technicians = self.import_people()
                clients = self.import_clients()
                addresses = self.import_addresses(clients)
                self.import_services(clients, addresses, technicians)
                self.counts["data_issues_open"] = DataIssue.objects.filter(resolved_at__isnull=True).count()
                run.status = "COMPLETED"
                run.counts = dict(self.counts)
                run.completed_at = timezone.now()
                run.save()
                report = self.build_report(options["mode"])
                if self.dry_run:
                    raise DryRunComplete
        except DryRunComplete:
            pass

        report_dir = options["report_dir"].resolve()
        report_dir.mkdir(parents=True, exist_ok=True)
        stamp = timezone.now().strftime("%Y%m%d-%H%M%S")
        report_path = report_dir / f"legacy-{options['mode']}-{'dry-run' if self.dry_run else 'applied'}-{stamp}.json"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        csv_path = report_path.with_suffix(".csv")
        with csv_path.open("w", newline="", encoding="utf-8-sig") as csv_file:
            writer = csv.writer(csv_file)
            writer.writerow(["Origen", "Fila", "Tipo", "Descripción"])
            for issue in self.issue_rows:
                writer.writerow([issue["source"], issue["row_reference"], issue["issue_type"], issue["description"]])
        if not self.dry_run:
            run.report_path = str(report_path)
            run.save(update_fields=["report_path", "updated_at"])
        self.stdout.write(json.dumps(report, ensure_ascii=False, indent=2, default=str))
        self.stdout.write(self.style.SUCCESS(f"Reporte: {report_path}"))

    def issue(self, source, row_reference, issue_type, description, payload=None):
        self.counts[f"issue_{issue_type}"] += 1
        self.issue_rows.append({"source": source, "row_reference": str(row_reference), "issue_type": issue_type, "description": description})
        DataIssue.objects.update_or_create(
            source=source,
            row_reference=str(row_reference),
            issue_type=issue_type,
            defaults={"description": description, "payload": payload or {}, "resolved_at": None, "resolved_by": None},
        )

    def import_people(self):
        profiles = {}
        user_rows = read_csv(self.source / "Users.csv")
        used_usernames = set(User.objects.values_list("username", flat=True))
        for index, row in enumerate(user_rows, 2):
            name = clean(row.get("Name"))
            if not name:
                continue
            username_base = slugify(name) or f"legacy-user-{index}"
            username = username_base
            suffix = 2
            while username in used_usernames:
                existing = User.objects.filter(username=username, first_name=name).first()
                if existing:
                    break
                username = f"{username_base}-{suffix}"
                suffix += 1
            used_usernames.add(username)
            user, created = User.objects.update_or_create(
                username=username,
                defaults={
                    "first_name": name,
                    "email": clean(row.get("Email")),
                    "phone": clean(row.get("Telefono")),
                    "is_active": False,
                    "must_change_password": True,
                },
            )
            if created:
                user.set_unusable_password()
                user.save(update_fields=["password"])
            role = clean(row.get("Role")).upper()
            group_name = GROUP_SUPERADMIN if role == "MASTER" else GROUP_ADMIN
            group = Group.objects.filter(name=group_name).first()
            if group:
                user.groups.set([group])
            profile, _ = TechnicianProfile.objects.update_or_create(
                display_name=name,
                defaults={"user": user, "active": False, "aliases": []},
            )
            profiles[normalized_text(name)] = profile
            self.counts["users_upserted"] += 1

        technician_rows = read_csv(self.source / "TECNICOS.csv")
        first_key = next(iter(technician_rows[0])) if technician_rows else ""
        for row in technician_rows:
            name = clean(row.get("NOMBRE"))
            if not name:
                continue
            profile, _ = TechnicianProfile.objects.update_or_create(
                display_name=name,
                defaults={"legacy_id": clean(row.get(first_key)) or None, "active": False},
            )
            profiles[normalized_text(name)] = profile
            self.counts["technician_profiles_upserted"] += 1

        if "marcelo balcar" in profiles:
            profiles["marcelo"] = profiles["marcelo balcar"]
            profile = profiles["marcelo balcar"]
            if "Marcelo" not in profile.aliases:
                profile.aliases = [*profile.aliases, "Marcelo"]
                profile.save(update_fields=["aliases", "updated_at"])
        return profiles

    def import_clients(self):
        rows = read_csv(self.source / "CLIENTES.csv")
        id_key = next(iter(rows[0]))
        phone_counts = Counter(normalize_digits(row.get("TELEFONO")) for row in rows if normalize_digits(row.get("TELEFONO")))
        clients = {}
        for index, row in enumerate(rows, 2):
            legacy_id = clean(row.get(id_key))
            phone = clean(row.get("TELEFONO"))
            normalized_phone = normalize_digits(phone)
            duplicate = phone_counts[normalized_phone] > 1
            if duplicate:
                self.issue("CLIENTES.csv", legacy_id or index, "DUPLICATE_PHONE", "Teléfono heredado repetido; se conserva como excepción.", {"phone": phone})
            delinquent_raw = clean(row.get("EN_MORA")).casefold()
            client, _ = Client.objects.update_or_create(
                legacy_id=legacy_id,
                defaults={
                    "name": clean(row.get("NOMBRE")) or "Cliente sin nombre",
                    "phone": phone,
                    "normalized_phone": normalized_phone,
                    "email": "" if clean(row.get("MAIL")).lower() == "none@gmail.com" else clean(row.get("MAIL")),
                    "dni": clean(row.get("DNI")),
                    "normalized_dni": normalize_digits(row.get("DNI")),
                    "is_delinquent": delinquent_raw in {"si", "sí", "true", "1", "en mora"},
                    "condition": clean(row.get("CONDICION")),
                    "legacy_duplicate_allowed": duplicate,
                    "legacy_locked": self.legacy_locked,
                },
            )
            clients[legacy_id] = client
            self.counts["clients_upserted"] += 1
        return clients

    def import_addresses(self, clients):
        rows = read_csv(self.source / "DIRECCIONES.csv")
        id_key = next(iter(rows[0]))
        addresses = {}
        for index, row in enumerate(rows, 2):
            legacy_id = clean(row.get(id_key))
            client_id = clean(row.get("ID_Cliente"))
            client = clients.get(client_id)
            if not client:
                self.issue("DIRECCIONES.csv", legacy_id or index, "ORPHAN_ADDRESS", "La dirección referencia un cliente inexistente.", row)
                self.counts["addresses_quarantined"] += 1
                continue
            address, _ = Address.objects.update_or_create(
                legacy_id=legacy_id,
                defaults={
                    "client": client,
                    "full_text": clean(row.get("DIRECCION")),
                    "legacy_locked": self.legacy_locked,
                },
            )
            addresses[(client_id, normalized_text(address.full_text))] = address
            self.counts["addresses_upserted"] += 1
        return addresses

    def import_services(self, clients, addresses, technicians):
        rows = read_csv(self.source / "SERVICIOS.csv")
        self.counts["photo_references_found"] = sum(
            1 for row in rows for field in ["IMAGEN1", "IMAGEN2", "IMAGEN3"] if clean(row.get(field))
        )
        keys = list(rows[0]) if rows else []
        row_id_key = keys[1]
        for index, row in enumerate(rows, 2):
            confirmation = clean(row.get("CONFIRMACION"))
            legacy_id = clean(row.get("9999999")) or None
            legacy_row_id = clean(row.get(row_id_key)) or None
            reference = legacy_id or legacy_row_id or index
            if confirmation == "PENDIENTE" and not clean(row.get("ID_Cliente")):
                self.issue("SERVICIOS.csv", reference, "EMPTY_SERVICE", "Fila cascarón sin cliente ni datos operativos; no se importa.")
                self.counts["services_empty_skipped"] += 1
                continue
            requires_review = confirmation == "ASIGNADO A TÉCNICO"
            if requires_review:
                self.issue("SERVICIOS.csv", reference, "STALE_ASSIGNMENT", "Asignación heredada no finalizada; requiere revisión.", {"scheduled_at": clean(row.get("FECHA")), "technician": clean(row.get("TECNICO ASIGNADO"))})
            client_id = clean(row.get("ID_Cliente"))
            client = clients.get(client_id)
            if not client:
                self.issue("SERVICIOS.csv", reference, "ORPHAN_SERVICE", "El servicio referencia un cliente inexistente.", row)
                self.counts["services_quarantined"] += 1
                self.counts["photo_references_quarantined"] += sum(
                    1 for field in ["IMAGEN1", "IMAGEN2", "IMAGEN3"] if clean(row.get(field))
                )
                continue

            address_text = clean(row.get("DIRECCION"))
            address = addresses.get((client_id, normalized_text(address_text)))
            scheduled_at = parse_legacy_wall_time(row.get("FECHA"))
            arrival_at = parse_legacy_wall_time(row.get("HORA"))
            completed_at = parse_legacy_wall_time(row.get("HORA FIN"))
            if not scheduled_at:
                self.issue("SERVICIOS.csv", reference, "MISSING_SCHEDULE", "Servicio sin fecha programada.")
            if not address_text:
                self.issue("SERVICIOS.csv", reference, "MISSING_ADDRESS", "Servicio sin dirección histórica.")

            status = Service.Status.COMPLETED if confirmation == "FINALIZADO" else Service.Status.ASSIGNED
            assignee_name = normalized_text(row.get("TECNICO ASIGNADO"))
            technician = technicians.get(assignee_name)
            if assignee_name and not technician:
                display = clean(row.get("TECNICO ASIGNADO"))
                technician, _ = TechnicianProfile.objects.update_or_create(display_name=display, defaults={"active": False, "aliases": []})
                technicians[assignee_name] = technician
            defaults = {
                "legacy_row_id": legacy_row_id,
                "client": client,
                "address": address,
                "client_name_snapshot": clean(row.get("NOMBRE")) or client.name,
                "client_phone_snapshot": clean(row.get("TELEFONO")) or client.phone,
                "address_snapshot": address_text,
                "scheduled_at": scheduled_at,
                "description": clean(row.get("SERVICIO")) or "Servicio sin descripción",
                "admin_notes": clean(row.get("NOTAS")),
                "assigned_technician": technician,
                "status": status,
                "arrival_at": arrival_at,
                "completion_notes": clean(row.get("OBSERVACIONES")),
                "completed_at": completed_at,
                "requires_review": requires_review,
                "legacy_locked": self.legacy_locked,
                "legacy_raw_timestamps": {
                    "scheduled": clean(row.get("FECHA")),
                    "arrival": clean(row.get("HORA")),
                    "completed": clean(row.get("HORA FIN")),
                },
            }
            lookup = {"legacy_id": legacy_id} if legacy_id else {"legacy_row_id": legacy_row_id}
            service, _ = Service.objects.update_or_create(**lookup, defaults=defaults)
            self.counts["services_upserted"] += 1
            self.import_service_photos(service, row, reference)

    def import_service_photos(self, service, row, reference):
        for field in ["IMAGEN1", "IMAGEN2", "IMAGEN3"]:
            url = clean(row.get(field))
            if not url:
                continue
            photo, _ = ServicePhoto.objects.get_or_create(service=service, legacy_url=url)
            self.counts["photo_references_upserted"] += 1
            if self.skip_media or photo.image:
                continue
            try:
                response = requests.get(url, timeout=15)
                response.raise_for_status()
                content = response.content
                checksum = hashlib.sha256(content).hexdigest()
                extension = Path(urlparse(url).path).suffix or mimetypes.guess_extension(response.headers.get("content-type", "")) or ".jpg"
                photo.checksum_sha256 = checksum
                photo.image.save(f"legacy-{reference}-{field.lower()}{extension}", ContentFile(content), save=False)
                photo.save()
                self.counts["photos_downloaded"] += 1
            except (requests.RequestException, OSError) as exc:
                self.issue("SERVICIOS.csv", reference, "MEDIA_DOWNLOAD_FAILED", f"No se pudo descargar {field}: {exc}", {"url": url})
                self.counts["photos_failed"] += 1

    def build_report(self, mode):
        return {
            "mode": mode,
            "dry_run": self.dry_run,
            "source": str(self.source),
            "generated_at": timezone.now().isoformat(),
            "counts": dict(self.counts),
            "issues": self.issue_rows,
            "acceptance": {
                "expected_clients": 558,
                "expected_duplicate_client_rows": 10,
                "expected_addresses": 584,
                "expected_orphan_addresses": 8,
                "expected_services": 1204,
                "expected_quarantined_services": 2,
                "expected_empty_services": 29,
                "expected_stale_assignments": 4,
                "expected_photo_references": 267,
            },
        }
