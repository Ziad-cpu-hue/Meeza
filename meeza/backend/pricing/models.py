from decimal import Decimal
from django.db import models

VEHICLE_TYPES = ["private_car", "pickup_truck", "refrigerated_truck", "motorcycle"]

DEFAULT_EFFICIENCY = {
    "private_car": 14.0,          # كم لكل لتر بنزين
    "pickup_truck": 9.0,
    "refrigerated_truck": 5.0,
    "motorcycle": 35.0,
}


class PricingConfig(models.Model):
    """إعدادات تسعير المنصة — سجل واحد فقط (Singleton) يتحكم فيه المالك من لوحة التحكم."""

    fuel_price_per_liter = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("22.25"))

    # النسب الأربع، ويجب أن يكون مجموعها 100
    platform_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("25.0"))
    fuel_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("36.0"))
    maintenance_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("19.0"))
    driver_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("20.0"))

    # معدل استهلاك الوقود لكل نوع مركبة (كم لكل لتر)
    fuel_efficiency = models.JSONField(default=dict)

    # رقم محفظة المنصة لاستقبال الدفع الإلكتروني (مرحلة 8)
    platform_wallet_number = models.CharField(max_length=20, blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "إعدادات التسعير"
        verbose_name_plural = "إعدادات التسعير"

    def save(self, *args, **kwargs):
        self.pk = 1  # singleton
        if not self.fuel_efficiency:
            self.fuel_efficiency = DEFAULT_EFFICIENCY
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1, defaults={"fuel_efficiency": DEFAULT_EFFICIENCY})
        return obj

    def __str__(self):
        return f"إعدادات التسعير (وقود: {self.fuel_price_per_liter} ج/لتر)"
