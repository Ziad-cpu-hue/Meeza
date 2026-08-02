from django.contrib import admin
from .models import DriverApplication


@admin.register(DriverApplication)
class DriverApplicationAdmin(admin.ModelAdmin):
    list_display = ("full_name", "phone", "vehicle_type", "status", "is_online", "created_at")
    list_filter = ("status", "vehicle_type", "is_online")
    search_fields = ("full_name", "phone", "user__email")
    readonly_fields = ("vehicle_photo", "license_photo", "id_selfie_front", "id_photo_back")
