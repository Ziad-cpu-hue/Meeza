from django.contrib.auth import get_user_model
from django.db.models import Sum, Count
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone
from rest_framework import permissions, generics
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import CustomerAdminSerializer
from drivers.models import DriverApplication
from drivers.serializers import DriverApplicationSerializer, DriverListSerializer
from trips.models import Trip
from trips.serializers import TripSerializer
from pricing.models import PricingConfig
from pricing.serializers import PricingConfigSerializer

User = get_user_model()


class OverviewView(APIView):
    """إحصائيات عامة للوحة تحكم المالك."""
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        today = timezone.now().date()
        config = PricingConfig.get_solo()
        completed_trips = Trip.objects.filter(status=Trip.Status.COMPLETED)

        return Response({
            "total_customers": User.objects.filter(user_type="customer").count(),
            "total_approved_drivers": DriverApplication.objects.filter(status="approved").count(),
            "pending_applications": DriverApplication.objects.filter(status="pending").count(),
            "trips_today": Trip.objects.filter(created_at__date=today).count(),
            "trips_live": Trip.objects.filter(status=Trip.Status.ACCEPTED).count(),
            "total_platform_revenue": float(completed_trips.aggregate(s=Sum("platform_cost"))["s"] or 0),
            "total_outstanding_debt": float(
                DriverApplication.objects.aggregate(s=Sum("debt_balance"))["s"] or 0
            ),
            "fuel_price_per_liter": float(config.fuel_price_per_liter),
        })


class ApplicationListView(generics.ListAPIView):
    permission_classes = [permissions.IsAdminUser]
    serializer_class = DriverApplicationSerializer

    def get_queryset(self):
        status_param = self.request.query_params.get("status", "pending")
        return DriverApplication.objects.filter(status=status_param)


class ApplicationDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAdminUser]
    serializer_class = DriverApplicationSerializer
    queryset = DriverApplication.objects.all()


class ApplicationDecisionView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk, action):
        try:
            application = DriverApplication.objects.get(pk=pk)
        except DriverApplication.DoesNotExist:
            return Response({"detail": "الطلب غير موجود"}, status=404)

        if action == "approve":
            application.status = DriverApplication.Status.APPROVED
        elif action == "reject":
            application.status = DriverApplication.Status.REJECTED
        else:
            return Response({"detail": "إجراء غير صحيح"}, status=400)

        application.admin_note = request.data.get("admin_note", "")
        application.reviewed_at = timezone.now()
        application.reviewed_by = request.user
        application.save()
        return Response(DriverApplicationSerializer(application).data)


class DriverListView(generics.ListAPIView):
    """إدارة الكباتن — تعرض أيضاً رصيد المديونية وحالة الحظر لكل كابتن (مرحلة 10 + 11)."""
    permission_classes = [permissions.IsAdminUser]
    serializer_class = DriverListSerializer
    queryset = DriverApplication.objects.filter(status="approved")


class SettleDriverDebtView(APIView):
    """المالك يسجل سداد مديونية الكابتن (كلها أو جزء منها)، فيُسمح له باستقبال طلبات جديدة مرة أخرى (مرحلة 10)."""
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        try:
            application = DriverApplication.objects.get(pk=pk)
        except DriverApplication.DoesNotExist:
            return Response({"detail": "الكابتن غير موجود"}, status=404)

        amount = request.data.get("amount")
        if amount in (None, ""):
            application.debt_balance = 0
        else:
            try:
                amount = float(amount)
            except (TypeError, ValueError):
                return Response({"detail": "قيمة غير صحيحة"}, status=400)
            application.debt_balance = max(float(application.debt_balance) - amount, 0)

        application.save(update_fields=["debt_balance"])
        return Response(DriverListSerializer(application).data)


class CustomerListView(generics.ListAPIView):
    """إدارة العملاء — عرض، حظر، إلغاء حظر (مرحلة 11)."""
    permission_classes = [permissions.IsAdminUser]
    serializer_class = CustomerAdminSerializer
    queryset = User.objects.filter(user_type="customer", is_staff=False, is_superuser=False).order_by("-created_at")


class CustomerToggleBlockView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        try:
            customer = User.objects.get(pk=pk, user_type="customer")
        except User.DoesNotExist:
            return Response({"detail": "العميل غير موجود"}, status=404)

        customer.is_blocked = not customer.is_blocked
        customer.save(update_fields=["is_blocked"])
        return Response(CustomerAdminSerializer(customer).data)


class AdminTripListView(generics.ListAPIView):
    """إدارة الرحلات — يدعم فلترة ?status=accepted لمتابعة الرحلات الحية (مرحلة 11)."""
    permission_classes = [permissions.IsAdminUser]
    serializer_class = TripSerializer

    def get_queryset(self):
        qs = Trip.objects.all()
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        return qs


class ConfirmTripPaymentView(APIView):
    """المالك يؤكد استلام تحويل الدفع الإلكتروني بعد مراجعة صورة الإثبات (مرحلة 8)."""
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        try:
            trip = Trip.objects.get(pk=pk, payment_method=Trip.PaymentMethod.WALLET)
        except Trip.DoesNotExist:
            return Response({"detail": "الرحلة غير موجودة أو ليست بالدفع الإلكتروني"}, status=404)

        trip.payment_status = Trip.PaymentStatus.CONFIRMED
        trip.save(update_fields=["payment_status"])
        return Response(TripSerializer(trip).data)


class EarningsReportView(APIView):
    """تقرير الأرباح اليومي والشهري لمتابعة إيرادات المنصة (مرحلة 11)."""
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        completed = Trip.objects.filter(status=Trip.Status.COMPLETED)

        daily = (
            completed.annotate(day=TruncDate("completed_at"))
            .values("day")
            .annotate(revenue=Sum("platform_cost"), trips=Count("id"))
            .order_by("-day")[:30]
        )
        monthly = (
            completed.annotate(month=TruncMonth("completed_at"))
            .values("month")
            .annotate(revenue=Sum("platform_cost"), trips=Count("id"))
            .order_by("-month")[:12]
        )

        return Response({
            "daily": [
                {"date": d["day"], "revenue": float(d["revenue"] or 0), "trips": d["trips"]}
                for d in daily
            ],
            "monthly": [
                {"month": m["month"], "revenue": float(m["revenue"] or 0), "trips": m["trips"]}
                for m in monthly
            ],
        })


class PricingConfigView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        config = PricingConfig.get_solo()
        return Response(PricingConfigSerializer(config).data)

    def patch(self, request):
        config = PricingConfig.get_solo()
        serializer = PricingConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
