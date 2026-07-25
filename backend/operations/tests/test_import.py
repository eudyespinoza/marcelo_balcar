import json
from pathlib import Path

import pytest
from django.core.management import call_command

from operations.models import Client, Service


@pytest.mark.django_db(transaction=True)
def test_real_export_dry_run_has_expected_counts(tmp_path, capsys):
    source = Path(__file__).resolve().parents[3] / "Data"
    if not source.exists():
        pytest.skip("La exportación privada no está disponible en este entorno.")
    call_command("import_legacy", source=source, mode="precutover", dry_run=True, skip_media=True, report_dir=tmp_path)
    output = capsys.readouterr().out
    start = output.find("{")
    end = output.rfind("}") + 1
    report = json.loads(output[start:end])
    assert report["counts"]["clients_upserted"] == 558
    assert report["counts"]["addresses_upserted"] == 584
    assert report["counts"]["addresses_quarantined"] == 8
    assert report["counts"]["services_upserted"] == 1204
    assert report["counts"]["services_quarantined"] == 2
    assert report["counts"]["services_empty_skipped"] == 29
    assert report["counts"]["issue_STALE_ASSIGNMENT"] == 4
    assert report["counts"]["photo_references_found"] == 267
    assert report["counts"]["photo_references_upserted"] == 266
    assert report["counts"]["photo_references_quarantined"] == 1
    assert len(list(tmp_path.glob("*.csv"))) == 1
    assert Client.objects.count() == 0
    assert Service.objects.count() == 0


@pytest.mark.django_db(transaction=True)
def test_real_export_applied_twice_is_idempotent(tmp_path):
    source = Path(__file__).resolve().parents[3] / "Data"
    if not source.exists():
        pytest.skip("La exportación privada no está disponible en este entorno.")
    for _ in range(2):
        call_command("import_legacy", source=source, mode="precutover", skip_media=True, report_dir=tmp_path)
    assert Client.objects.count() == 558
    assert Service.objects.count() == 1204
