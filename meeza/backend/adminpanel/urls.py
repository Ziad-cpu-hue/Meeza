from django.urls import path
from .views import (
    OverviewView, ApplicationListView, ApplicationDetailView, ApplicationDecisionView,
    DriverListView, SettleDriverDebtView, CustomerListView, CustomerToggleBlockView,
    AdminTripListView, ConfirmTripPaymentView, EarningsReportView, PricingConfigView,
)

urlpatterns = [
    path("overview/", OverviewView.as_view(), name="admin-overview"),
    path("applications/", ApplicationListView.as_view(), name="admin-applications"),
    path("applications/<int:pk>/", ApplicationDetailView.as_view(), name="admin-application-detail"),
    path("applications/<int:pk>/approve/", ApplicationDecisionView.as_view(), {"action": "approve"}, name="admin-application-approve"),
    path("applications/<int:pk>/reject/", ApplicationDecisionView.as_view(), {"action": "reject"}, name="admin-application-reject"),
    path("drivers/", DriverListView.as_view(), name="admin-drivers"),
    path("drivers/<int:pk>/settle-debt/", SettleDriverDebtView.as_view(), name="admin-driver-settle-debt"),
    path("customers/", CustomerListView.as_view(), name="admin-customers"),
    path("customers/<int:pk>/toggle-block/", CustomerToggleBlockView.as_view(), name="admin-customer-toggle-block"),
    path("trips/", AdminTripListView.as_view(), name="admin-trips"),
    path("trips/<int:pk>/confirm-payment/", ConfirmTripPaymentView.as_view(), name="admin-trip-confirm-payment"),
    path("earnings/", EarningsReportView.as_view(), name="admin-earnings"),
    path("pricing-config/", PricingConfigView.as_view(), name="admin-pricing-config"),
]
