from django.conf import settings
from django.db import models


class Trip(models.Model):
    """طلب رحلة/توصيل — نقل أشخاص، نقل ثقيل/مبرد، أو توصيل بالموتوسيكل."""

    class ServiceType(models.TextChoices):
        CAR = "car", "نقل أشخاص"
        PICKUP_TRUCK = "pickup_truck", "نقل ثقيل (بيك أب)"
        REFRIGERATED_TRUCK = "refrigerated_truck", "نقل مبرد"
        MOTORCYCLE = "motorcycle", "توصيل بالموتوسيكل"

    class Status(models.TextChoices):
        PENDING = "pending", "بانتظار كابتن"
        ACCEPTED = "accepted", "تم القبول"
        COMPLETED = "completed", "مكتملة"
        CANCELLED = "cancelled", "ملغاة"

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "نقدي"
        WALLET = "wallet", "محفظة إلكترونية"

    class PaymentStatus(models.TextChoices):
        PENDING = "pending", "لم يتم الدفع بعد"
        PROOF_UPLOADED = "proof_uploaded", "بانتظار مراجعة الإدارة"
        CONFIRMED = "confirmed", "تم تأكيد الدفع"

    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trips_as_customer")
    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="trips_as_driver"
    )

    service_type = models.CharField(max_length=30, choices=ServiceType.choices)
    pickup_address = models.CharField(max_length=255)
    dropoff_address = models.CharField(max_length=255)
    distance_km = models.DecimalField(max_digits=8, decimal_places=2)
    notes = models.TextField(blank=True)

    # إحداثيات نقطتي الانطلاق والوصول (مرحلة 3 — اختيار من الخريطة)
    pickup_lat = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    pickup_lng = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    dropoff_lat = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    dropoff_lng = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    estimated_duration_min = models.PositiveIntegerField(null=True, blank=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)

    # تفصيل السعر محسوب وقت إنشاء الرحلة حسب إعدادات المالك في نفس اللحظة
    fuel_cost = models.DecimalField(max_digits=8, decimal_places=2)
    maintenance_cost = models.DecimalField(max_digits=8, decimal_places=2)
    platform_cost = models.DecimalField(max_digits=8, decimal_places=2)
    driver_profit = models.DecimalField(max_digits=8, decimal_places=2)
    total_price = models.DecimalField(max_digits=8, decimal_places=2)

    # زيادة السعر إذا لم يقبل أي كابتن الطلب (مرحلة 6)
    bonus_amount = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    price_increase_count = models.PositiveSmallIntegerField(default=0)

    # موقع الكابتن الحي أثناء التوجه للعميل أو تنفيذ الرحلة (مرحلة 7 — بولينج)
    driver_lat = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    driver_lng = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    driver_location_updated_at = models.DateTimeField(null=True, blank=True)

    # الدفع وعمولة المنصة (مراحل 8 و 9)
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    payment_status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
    wallet_proof = models.ImageField(upload_to="payment_proofs/", null=True, blank=True)
    commission_settled = models.BooleanField(
        default=False, help_text="هل تم تسجيل عمولة المنصة كمديونية على الكابتن (لرحلات الكاش)"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.pickup_address} → {self.dropoff_address} ({self.get_status_display()})"
