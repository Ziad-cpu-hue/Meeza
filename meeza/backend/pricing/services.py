from decimal import Decimal, ROUND_HALF_UP
from .models import PricingConfig, DEFAULT_EFFICIENCY

TWO_PLACES = Decimal("0.01")
MIN_TRIP_PRICE = Decimal("15.00")


def _round(value):
    return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def calculate_trip_price(distance_km, vehicle_type):
    """
    يحسب سعر الرحلة بالكامل بناءً على:
    - سعر الوقود الحالي (يضبطه المالك)
    - معدل استهلاك المركبة (كم/لتر)
    - نسب توزيع السعر: وقود / صيانة / منصة / كابتن (يضبطها المالك ويجب أن يساوي مجموعها 100%)
    """
    config = PricingConfig.get_solo()
    distance_km = Decimal(str(distance_km))

    fuel_price_per_liter = Decimal(str(config.fuel_price_per_liter))
    platform_percent = Decimal(str(config.platform_percent))
    fuel_percent = Decimal(str(config.fuel_percent)) if config.fuel_percent else Decimal("36.0")
    maintenance_percent = Decimal(str(config.maintenance_percent))
    driver_percent = Decimal(str(config.driver_percent))

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
    }
