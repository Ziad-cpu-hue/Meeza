from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from .models import DriverApplication

User = get_user_model()


class DriverApplySerializer(serializers.ModelSerializer):
    email = serializers.EmailField(write_only=True)
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = DriverApplication
        fields = [
            "full_name", "phone", "email", "password", "vehicle_type",
            "vehicle_photo", "license_photo", "id_selfie_front", "id_photo_back",
        ]

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("البريد الإلكتروني مستخدم بالفعل")
        return value

    def create(self, validated_data):
        email = validated_data.pop("email")
        password = validated_data.pop("password")
        user = User(
            username=email, email=email, full_name=validated_data["full_name"],
            phone=validated_data["phone"], user_type=User.UserType.DRIVER,
        )
        user.set_password(password)
        user.save()
        application = DriverApplication.objects.create(user=user, **validated_data)
        return application


class DriverApplicationSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    vehicle_type_display = serializers.CharField(source="get_vehicle_type_display", read_only=True)
    is_blocked_for_debt = serializers.BooleanField(read_only=True)

    class Meta:
        model = DriverApplication
        fields = [
            "id", "full_name", "phone", "vehicle_type", "vehicle_type_display",
            "vehicle_photo", "license_photo", "id_selfie_front", "id_photo_back",
            "status", "status_display", "admin_note", "is_online", "created_at",
            "debt_balance", "debt_limit", "is_blocked_for_debt",
        ]
        read_only_fields = ["status", "admin_note", "is_online", "created_at", "debt_balance", "debt_limit"]


class DriverListSerializer(serializers.ModelSerializer):
    vehicle_type_display = serializers.CharField(source="get_vehicle_type_display", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    trips_count = serializers.SerializerMethodField()
    is_blocked_for_debt = serializers.BooleanField(read_only=True)

    class Meta:
        model = DriverApplication
        fields = [
            "id", "full_name", "phone", "email", "vehicle_type", "vehicle_type_display", "is_online",
            "trips_count", "debt_balance", "debt_limit", "is_blocked_for_debt",
        ]

    def get_trips_count(self, obj):
        return obj.user.trips_as_driver.filter(status="completed").count()
