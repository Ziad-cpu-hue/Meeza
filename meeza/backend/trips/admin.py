from django.contrib import admin
from .models import Trip


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "driver", "service_type", "status", "total_price", "created_at")
    list_filter = ("status", "service_type")
    search_fields = ("pickup_address", "dropoff_address", "customer__email", "driver__email")
