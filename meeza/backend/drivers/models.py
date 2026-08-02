from django.conf import settings
from django.db import models


def driver_doc_path(instance, filename):
    return f"driver_documents/{instance.user_id}/{filename}"


class DriverApplication(models.Model):
    """طلب انضمام كابتن مع المستندات المطلوبة للمراجعة من المالك."""

    class VehicleType(models.TextChoices):
        PRIVATE_CAR = "private_car", "سيارة خاصة"
        PICKUP_TRUCK = "pickup_truck", "سيارة نقل (بيك أب)"
        REFRIGERATED_TRUCK = "refrigerated_truck", "شاحنة مبردة"
        MOTORCYCLE = "motorcycle", "موتوسيكل توصيل"

    class Status(models.TextChoices):
        PENDING = "pending", "قيد المراجعة"
        APPROVED = "approved", "معتمد"
        REJECTED = "rejected", "مرفوض"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="driver_application")

    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    vehicle_type = models.CharField(max_length=30, choices=VehicleType.choices)

    vehicle_photo = models.ImageField(upload_to=driver_doc_path)
    license_photo = models.ImageField(upload_to=driver_doc_path)
    id_selfie_front = models.ImageField(upload_to=driver_doc_path, help_text="صورة شخصية ممسكاً البطاقة من ناحية الوش")
    id_photo_back = models.ImageField(upload_to=driver_doc_path, help_text="صورة ظهر البطاقة الشخصية")

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    admin_note = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_applications"
    )

    is_online = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    # ---------- نظام مديونية الكابتن (مرحلة 10) ----------
    debt_balance = models.DecimalField(
        max_digits=8, decimal_places=2, default=0,
        help_text="إجمالي عمولة المنصة المستحقة على الكابتن من رحلات الكاش غير المسددة",
    )
    debt_limit = models.DecimalField(
        max_digits=8, decimal_places=2, default=200,
        help_text="الحد الأقصى للمديونية قبل إيقاف استقبال طلبات جديدة",
    )

    @property
    def is_blocked_for_debt(self):
        return self.debt_balance > self.debt_limit

    class Meta:
        verbose_name = "طلب انضمام كابتن"
        verbose_name_plural = "طلبات انضمام الكباتن"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.full_name} - {self.get_vehicle_type_display()} ({self.get_status_display()})"
