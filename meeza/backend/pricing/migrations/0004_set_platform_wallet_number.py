# Generated manually — تعيين رقم محفظة المنصة الفعلي كقيمة افتراضية (يظل قابل للتعديل من لوحة التحكم)

from django.db import migrations

WALLET_NUMBER = "01556060683"


def set_wallet_number(apps, schema_editor):
    PricingConfig = apps.get_model("pricing", "PricingConfig")
    config, _ = PricingConfig.objects.get_or_create(pk=1)
    if not config.platform_wallet_number:
        config.platform_wallet_number = WALLET_NUMBER
        config.save(update_fields=["platform_wallet_number"])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('pricing', '0003_pricingconfig_pricing_mode_price_per_km'),
    ]

    operations = [
        migrations.RunPython(set_wallet_number, reverse_noop),
    ]
