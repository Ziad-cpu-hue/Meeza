from decimal import Decimal, ROUND_HALF_UP
from .models import PricingConfig, DEFAULT_EFFICIENCY, DEFAULT_PRICE_PER_KM

TWO_PLACES = Decimal("0.01")
MIN_TRIP_PRICE = Decimal("15.00")


def _round(value):
    return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def calculate_trip_price(distance_km, vehicle_type):
    """
    يحسب سعر الرحلة بالكامل، بواحد من وضعين يضبطهما المالك من لوحة التحكم:

    1) fuel_based (الوضع الافتراضي — السعر الحالي بيفضل زي ما هو بدون أي تغيير):
       - سعر الوقود الحالي (يضبطه المالك)
       - معدل استهلاك المركبة (كم/لتر)
       - نسب توزيع السعر: وقود / صيانة / منصة / كابتن (يضبطها المالك ويجب أن يساوي مجموعها 100%)

    2) per_km (اختياري — سعر ثابت للكيلومتر الواحد بالجنيه لكل نوع مركبة):
       - السعر = المسافة (كم) × سعر الكيلومتر الواحد
       - نفس نسب التوزيع (وقود/صيانة/منصة/كابتن) بتتطبق على الناتج عشان تظل حسابات
         التسويات والعمولات شغالة بنفس الطريقة في الحالتين.
    """
    config = PricingConfig.get_solo()
    distance_km = Decimal(str(distance_km))

    fuel_price_per_liter = Decimal(str(config.fuel_price_per_liter))
    platform_percent = Decimal(str(config.platform_percent))
    fuel_percent = Decimal(str(config.fuel_percent)) if config.fuel_percent else Decimal("36.0")
    maintenance_percent = Decimal(str(config.maintenance_percent))
    driver_percent = Decimal(str(config.driver_percent))

    if config.pricing_mode == PricingConfig.PricingMode.PER_KM:
        rate_map = config.price_per_km or DEFAULT_PRICE_PER_KM
        price_per_km = Decimal(str(rate_map.get(vehicle_type, DEFAULT_PRICE_PER_KM.get(vehicle_type, 4))))
        total_price = distance_km * price_per_km
        if total_price < MIN_TRIP_PRICE:
            total_price = MIN_TRIP_PRICE
        # مفيش استهلاك وقود فعلي متحسب في الوضع ده، فبنشتق تكلفة الوقود نسبياً من نفس
        # النسبة المحددة عشان تفضل شكل الاستجابة والتسويات المالية زي بعضها في الوضعين
        fuel_cost = total_price * (fuel_percent / Decimal("100"))
    else:
        efficiency_map = config.fuel_efficiency or DEFAULT_EFFICIENCY
        efficiency = Decimal(str(efficiency_map.get(vehicle_type, DEFAULT_EFFICIENCY.get(vehicle_type, 12))))

        liters_used = distance_km / efficiency
        fuel_cost = liters_used * fuel_price_per_liter

        total_price = (fuel_cost / (fuel_percent / Decimal("100")))
        if total_price < MIN_TRIP_PRICE:
            total_price = MIN_TRIP_PRICE

    platform_cost = total_price * (platform_percent / Decimal("100"))
    maintenance_cost = total_price * (maintenance_percent / Decimal("100"))
    driver_profit = total_price * (driver_percent / Decimal("100"))

    return {
        "distance_km": float(distance_km),
        "fuel_price_per_liter": float(fuel_price_per_liter),
        "fuel_cost": float(_round(fuel_cost)),
        "fuel_percent": float(fuel_percent),
        "maintenance_cost": float(_round(maintenance_cost)),
        "maintenance_percent": float(maintenance_percent),
        "platform_cost": float(_round(platform_cost)),
        "platform_percent": float(platform_percent),
        "driver_profit": float(_round(driver_profit)),
        "driver_percent": float(driver_percent),
        "total_price": float(_round(total_price)),
        "pricing_mode": config.pricing_mode,
    }
