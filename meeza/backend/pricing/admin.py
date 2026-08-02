from django.contrib import admin
from .models import PricingConfig


@admin.register(PricingConfig)
class PricingConfigAdmin(admin.ModelAdmin):
    list_display = ("fuel_price_per_liter", "platform_percent", "fuel_percent", "maintenance_percent", "driver_percent", "updated_at")

    def has_add_permission(self, request):
        return not PricingConfig.objects.exists()
