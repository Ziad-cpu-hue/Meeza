from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """مستخدم ميزة: عميل أو كابتن. تسجيل الدخول يتم بالبريد الإلكتروني."""

    class UserType(models.TextChoices):
        CUSTOMER = "customer", "عميل"
        DRIVER = "driver", "كابتن"

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    user_type = models.CharField(max_length=10, choices=UserType.choices, default=UserType.CUSTOMER)
    is_google_account = models.BooleanField(default=False)
    is_blocked = models.BooleanField(default=False, help_text="حظر العميل من إنشاء رحلات جديدة")
    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def __str__(self):
        return f"{self.full_name or self.username} ({self.get_user_type_display()})"
