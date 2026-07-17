from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class MeezaUserAdmin(UserAdmin):
    list_display = ("email", "full_name", "phone", "user_type", "is_staff", "created_at")
    fieldsets = UserAdmin.fieldsets + (
        ("بيانات ميزة", {"fields": ("full_name", "phone", "user_type", "is_google_account")}),
    )
