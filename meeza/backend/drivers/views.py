from datetime import timedelta
from django.db.models import Sum, Count, Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import UserSerializer
from .models import DriverApplication
from .serializers import DriverApplySerializer, DriverApplicationSerializer


class DriverApplyView(APIView):
    """تقديم طلب انضمام كابتن جديد مع رفع المستندات المطلوبة (multipart/form-data)."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = DriverApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        application = serializer.save()
        token, _ = Token.objects.get_or_create(user=application.user)
        return Response(
            {"token": token.key, "user": UserSerializer(application.user).data},
            status=status.HTTP_201_CREATED,
        )


class MyApplicationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            application = request.user.driver_application
        except DriverApplication.DoesNotExist:
            return Response({"detail": "لا يوجد طلب انضمام مرتبط بهذا الحساب"}, status=404)
        return Response(DriverApplicationSerializer(application).data)


class ToggleOnlineView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            application = request.user.driver_application
        except DriverApplication.DoesNotExist:
            return Response({"detail": "لا يوجد طلب انضمام مرتبط بهذا الحساب"}, status=404)

        if application.status != DriverApplication.Status.APPROVED:
            return Response({"detail": "لا يمكنك الاتصال قبل الموافقة على طلبك"}, status=400)

        application.is_online = not application.is_online
        application.save(update_fields=["is_online"])
        return Response({"is_online": application.is_online})


class DriverStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        trips = request.user.trips_as_driver.filter(status__in=["accepted", "completed"])
        today = timezone.now().date()

        trips_today = trips.filter(created_at__date=today)
        earnings_today = trips_today.aggregate(s=Sum("driver_profit"))["s"] or 0
        earnings_total = trips.aggregate(s=Sum("driver_profit"))["s"] or 0

        return Response({
            "trips_today": trips_today.count(),
            "earnings_today": float(earnings_today),
            "trips_total": trips.count(),
            "earnings_total": float(earnings_total),
        })
