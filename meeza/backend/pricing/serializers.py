from decimal import Decimal
from rest_framework import serializers
from .models import PricingConfig


class PricingConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = PricingConfig
        fields = [
            "fuel_price_per_liter", "platform_percent", "fuel_percent",
            "maintenance_percent", "driver_percent", "fuel_efficiency",
            "platform_wallet_number", "updated_at",
        ]
        read_only_fields = ["updated_at"]


class EstimateRequestSerializer(serializers.Serializer):
    distance_km = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=Decimal("0.1"))
    service_type = serializers.ChoiceField(
        choices=["car", "pickup_truck", "refrigerated_truck", "motorcycle"]
    )
