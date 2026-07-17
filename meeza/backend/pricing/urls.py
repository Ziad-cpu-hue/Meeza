from django.urls import path
from .views import CurrentPricingView, EstimatePriceView

urlpatterns = [
    path("current/", CurrentPricingView.as_view(), name="pricing-current"),
    path("estimate/", EstimatePriceView.as_view(), name="pricing-estimate"),
]
