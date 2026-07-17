from rest_framework import serializers
from .models import Trip


class TripCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = [
            "service_type", "pickup_address", "dropoff_address", "distance_km", "notes",
            "pickup_lat", "pickup_lng", "dropoff_lat", "dropoff_lng",
            "estimated_duration_min", "payment_method",
        ]


class TripSerializer(serializers.ModelSerializer):
    service_type_display = serializers.CharField(source="get_service_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    payment_method_display = serializers.CharField(source="get_payment_method_display", read_only=True)
    payment_status_display = serializers.CharField(source="get_payment_status_display", read_only=True)
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)
    driver_name = serializers.CharField(source="driver.full_name", read_only=True, default=None)
    driver_phone = serializers.CharField(source="driver.phone", read_only=True, default=None)
    driver_vehicle_type = serializers.SerializerMethodField()
    driver_vehicle_type_display = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = [
            "id", "service_type", "service_type_display", "pickup_address", "dropoff_address",
            "pickup_lat", "pickup_lng", "dropoff_lat", "dropoff_lng", "estimated_duration_min",
            "distance_km", "notes", "status", "status_display", "customer_name",
            "driver_name", "driver_phone", "driver_vehicle_type", "driver_vehicle_type_display",
            "fuel_cost", "maintenance_cost", "platform_cost", "driver_profit", "total_price",
            "bonus_amount", "price_increase_count",
            "driver_lat", "driver_lng", "driver_location_updated_at",
            "payment_method", "payment_method_display", "payment_status", "payment_status_display",
            "wallet_proof",
            "created_at", "updated_at", "accepted_at", "completed_at",
        ]

    def get_driver_vehicle_type(self, obj):
        app = getattr(obj.driver, "driver_application", None)
        return app.vehicle_type if app else None

    def get_driver_vehicle_type_display(self, obj):
        app = getattr(obj.driver, "driver_application", None)
        return app.get_vehicle_type_display() if app else None


class IncreasePriceSerializer(serializers.Serializer):
    extra_amount = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=1)


class DriverLocationSerializer(serializers.Serializer):
    lat = serializers.DecimalField(max_digits=10, decimal_places=6)
    lng = serializers.DecimalField(max_digits=10, decimal_places=6)


class PaymentProofSerializer(serializers.Serializer):
    wallet_proof = serializers.ImageField()
