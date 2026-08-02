# Generated manually — إضافة وضع "سعر ثابت لكل كيلومتر" كخيار إضافي بجانب وضع الوقود الافتراضي

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pricing', '0002_pricingconfig_platform_wallet_number'),
    ]

    operations = [
        migrations.AddField(
            model_name='pricingconfig',
            name='pricing_mode',
            field=models.CharField(
                choices=[
                    ('fuel_based', 'حساب حسب استهلاك الوقود (الوضع الحالي)'),
                    ('per_km', 'سعر ثابت لكل كيلومتر'),
                ],
                default='fuel_based',
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name='pricingconfig',
            name='price_per_km',
            field=models.JSONField(default=dict),
        ),
    ]
