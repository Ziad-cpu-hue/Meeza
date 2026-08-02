from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PricingConfig
from .serializers import PricingConfigSerializer, EstimateRequestSerializer
from .services import calculate_trip_price

# service_type القادم من الواجهة "car" يقابله نوع المركبة "private_car" في نظام التسعير
SERVICE_TO_VEHICLE = {
    "car": "private_car",
    "pickup_truck": "pickup_truck",
    "refrigerated_truck": "refrigerated_truck",
    "motorcycle": "motorcycle",
}


class CurrentPricingView(APIView):
    """بيانات عامة (بدون تسجيل دخول) لعرض سعر الوقود الحالي في الصفحة الرئيسية."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        config = PricingConfig.get_solo()
        return Response({
            "fuel_price_per_liter": float(config.fuel_price_per_liter),
            "platform_wallet_number": config.platform_wallet_number,
        })


class EstimatePriceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = EstimateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vehicle_type = SERVICE_TO_VEHICLE[serializer.validated_data["service_type"]]
        result = calculate_trip_price(serializer.validated_data["distance_km"], vehicle_type)

        # خصوصية التسعير: تفاصيل توزيع السعر (الوقود/الصيانة/العمولة) بيانات داخلية
        # خاصة بالمنصة. العميل العادي المفروض يشوف السعر النهائي بس، أما الموظفين
        # (is_staff) فيشوفوا التفصيل الكامل لو احتاجوه.
        if not request.user.is_staff:
            result = {
                "distance_km": result["distance_km"],
                "total_price": result["total_price"],
            }
        return Response(result)
