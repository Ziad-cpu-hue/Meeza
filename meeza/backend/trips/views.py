from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from pricing.services import calculate_trip_price
from pricing.views import SERVICE_TO_VEHICLE
from drivers.models import DriverApplication
from .models import Trip
from .serializers import (
    TripCreateSerializer, TripSerializer, IncreasePriceSerializer,
    DriverLocationSerializer, PaymentProofSerializer,
)


COORD_FIELDS = ("pickup_lat", "pickup_lng", "dropoff_lat", "dropoff_lng")


def _sanitize_coords(data, fields=COORD_FIELDS):
    """
    يقرّب حقول الإحداثيات (خط الطول/العرض) إلى 6 خانات عشرية قبل التحقق،
    عشان أي فرق دقة بسيط جاي من الفرونت إند (أو من أي مصدر تاني) ميرفضش الطلب
    برسالة "أكثر من 6 خانات عشرية" غير مبرَّرة.
    """
    if hasattr(data, "dict"):
        data = data.dict()
    else:
        data = dict(data)
    for field in fields:
        value = data.get(field)
        if value not in (None, ""):
            try:
                data[field] = round(float(value), 6)
            except (TypeError, ValueError):
                pass  # سيب القيمة زي ما هي، السيريالايزر هيرفضها برسالة واضحة لو فعلاً غلط
    return data


class IsCustomer(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.user_type == "customer"


class IsDriver(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.user_type == "driver"


class TripCreateView(APIView):
    """العميل يطلب رحلة جديدة — يتم حساب السعر تلقائياً وقت الإنشاء (مرحلة 3 + 4)."""
    permission_classes = [IsCustomer]

    def post(self, request):
        if request.user.is_blocked:
            return Response({"detail": "تم حظر حسابك من إنشاء رحلات جديدة، تواصل مع الدعم"}, status=403)

        serializer = TripCreateSerializer(data=_sanitize_coords(request.data))
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        vehicle_type = SERVICE_TO_VEHICLE[data["service_type"]]
        price = calculate_trip_price(data["distance_km"], vehicle_type)

        trip = Trip.objects.create(
            customer=request.user,
            service_type=data["service_type"],
            pickup_address=data["pickup_address"],
            dropoff_address=data["dropoff_address"],
            distance_km=data["distance_km"],
            notes=data.get("notes", ""),
            pickup_lat=data.get("pickup_lat"),
            pickup_lng=data.get("pickup_lng"),
            dropoff_lat=data.get("dropoff_lat"),
            dropoff_lng=data.get("dropoff_lng"),
            estimated_duration_min=data.get("estimated_duration_min"),
            payment_method=data.get("payment_method", Trip.PaymentMethod.CASH),
            fuel_cost=price["fuel_cost"],
            maintenance_cost=price["maintenance_cost"],
            platform_cost=price["platform_cost"],
            driver_profit=price["driver_profit"],
            total_price=price["total_price"],
        )
        return Response(TripSerializer(trip).data, status=status.HTTP_201_CREATED)


class MyTripsView(APIView):
    """رحلات العميل الحالية، أو رحلات الكابتن حسب نوع المستخدم."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.user_type == "driver":
            trips = Trip.objects.filter(driver=request.user)
        else:
            trips = Trip.objects.filter(customer=request.user)
        return Response(TripSerializer(trips, many=True).data)


class TripDetailView(APIView):
    """تفاصيل رحلة واحدة — تُستخدم أيضاً للتتبع اللحظي (بولينج) من طرف العميل (مرحلة 7)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            if request.user.user_type == "driver":
                trip = Trip.objects.get(pk=pk, driver=request.user)
            else:
                trip = Trip.objects.get(pk=pk, customer=request.user)
        except Trip.DoesNotExist:
            return Response({"detail": "الرحلة غير موجودة"}, status=404)
        return Response(TripSerializer(trip).data)


# نوع الخدمة الذي يمكن لكل نوع مركبة تنفيذه
VEHICLE_TO_SERVICES = {
    "private_car": ["car"],
    "pickup_truck": ["pickup_truck"],
    "refrigerated_truck": ["refrigerated_truck"],
    "motorcycle": ["motorcycle"],
}


class AvailableTripsView(APIView):
    """بث الطلبات المتاحة لكل الكباتن المؤهلين (مرحلة 5). يستدعيها تطبيق الكابتن بشكل دوري (بولينج)."""
    permission_classes = [IsDriver]

    def get(self, request):
        try:
            application = request.user.driver_application
        except DriverApplication.DoesNotExist:
            return Response([])

        if application.status != DriverApplication.Status.APPROVED or not application.is_online:
            return Response([])

        if application.is_blocked_for_debt:
            return Response([])

        allowed_services = VEHICLE_TO_SERVICES.get(application.vehicle_type, [])
        trips = Trip.objects.filter(status=Trip.Status.PENDING, service_type__in=allowed_services)
        return Response(TripSerializer(trips, many=True).data)


class AcceptTripView(APIView):
    """أول كابتن يقبل الطلب يفوز به (مرحلة 5) — يمنع سباق القبول عبر قفل الصف، ويمنع الكباتن المديونين (مرحلة 10)."""
    permission_classes = [IsDriver]

    def post(self, request, pk):
        try:
            application = request.user.driver_application
        except DriverApplication.DoesNotExist:
            return Response({"detail": "لا يوجد حساب كابتن مرتبط"}, status=403)

        if application.status != DriverApplication.Status.APPROVED:
            return Response({"detail": "حسابك غير معتمد بعد"}, status=403)

        if application.is_blocked_for_debt:
            return Response(
                {"detail": "تم إيقاف استقبال طلبات جديدة بسبب تجاوز حد المديونية المسموح به. برجاء سداد المستحقات أولاً."},
                status=403,
            )

        with transaction.atomic():
            trip = (
                Trip.objects.select_for_update()
                .filter(pk=pk, status=Trip.Status.PENDING)
                .first()
            )
            if trip is None:
                return Response({"detail": "الرحلة غير متاحة أو تم قبولها بالفعل"}, status=400)

            trip.driver = request.user
            trip.status = Trip.Status.ACCEPTED
            trip.accepted_at = timezone.now()
            trip.save()

        return Response(TripSerializer(trip).data)


class IncreasePriceView(APIView):
    """العميل يزوّد سعر الرحلة/يضيف بونص للكابتن إذا لم يقبل أحد الطلب خلال فترة (مرحلة 6)."""
    permission_classes = [IsCustomer]

    def post(self, request, pk):
        try:
            trip = Trip.objects.get(pk=pk, customer=request.user, status=Trip.Status.PENDING)
        except Trip.DoesNotExist:
            return Response({"detail": "الرحلة غير موجودة أو تم قبولها بالفعل"}, status=400)

        serializer = IncreasePriceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        extra = serializer.validated_data["extra_amount"]

        trip.bonus_amount += extra
        trip.total_price += extra
        trip.driver_profit += extra  # الزيادة بالكامل تذهب كحافز إضافي للكابتن
        trip.price_increase_count += 1
        trip.save()
        return Response(TripSerializer(trip).data)


class DriverLocationUpdateView(APIView):
    """الكابتن يرسل موقعه الحالي كل بضع ثوانٍ أثناء التوجه للعميل أو تنفيذ الرحلة (مرحلة 7 — بولينج)."""
    permission_classes = [IsDriver]

    def post(self, request, pk):
        try:
            trip = Trip.objects.get(pk=pk, driver=request.user, status=Trip.Status.ACCEPTED)
        except Trip.DoesNotExist:
            return Response({"detail": "الرحلة غير موجودة أو غير نشطة"}, status=400)

        serializer = DriverLocationSerializer(data=_sanitize_coords(request.data, fields=("lat", "lng")))
        serializer.is_valid(raise_exception=True)

        trip.driver_lat = serializer.validated_data["lat"]
        trip.driver_lng = serializer.validated_data["lng"]
        trip.driver_location_updated_at = timezone.now()
        trip.save(update_fields=["driver_lat", "driver_lng", "driver_location_updated_at"])
        return Response({"detail": "تم تحديث الموقع"})


class UploadPaymentProofView(APIView):
    """العميل يرفع إثبات تحويل الدفع بالمحفظة الإلكترونية (مرحلة 8)."""
    permission_classes = [IsCustomer]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        try:
            trip = Trip.objects.get(pk=pk, customer=request.user, payment_method=Trip.PaymentMethod.WALLET)
        except Trip.DoesNotExist:
            return Response({"detail": "الرحلة غير موجودة أو ليست بالدفع الإلكتروني"}, status=400)

        serializer = PaymentProofSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        trip.wallet_proof = serializer.validated_data["wallet_proof"]
        trip.payment_status = Trip.PaymentStatus.PROOF_UPLOADED
        trip.save(update_fields=["wallet_proof", "payment_status"])
        return Response(TripSerializer(trip).data)


class CompleteTripView(APIView):
    """إنهاء الرحلة — يسجل عمولة المنصة كمديونية على الكابتن في حالة الدفع الكاش (مرحلة 9)."""
    permission_classes = [IsDriver]

    def post(self, request, pk):
        try:
            trip = Trip.objects.get(pk=pk, driver=request.user, status=Trip.Status.ACCEPTED)
        except Trip.DoesNotExist:
            return Response({"detail": "الرحلة غير موجودة"}, status=400)

        trip.status = Trip.Status.COMPLETED
        trip.completed_at = timezone.now()

        if trip.payment_method == Trip.PaymentMethod.CASH and not trip.commission_settled:
            try:
                application = request.user.driver_application
                application.debt_balance = Decimal(application.debt_balance) + Decimal(trip.platform_cost)
                application.save(update_fields=["debt_balance"])
                trip.commission_settled = True
                trip.payment_status = Trip.PaymentStatus.CONFIRMED
            except DriverApplication.DoesNotExist:
                pass

        trip.save()
        return Response(TripSerializer(trip).data)
