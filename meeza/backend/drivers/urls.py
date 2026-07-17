from django.urls import path
from .views import DriverApplyView, MyApplicationView, ToggleOnlineView, DriverStatsView

urlpatterns = [
    path("apply/", DriverApplyView.as_view(), name="driver-apply"),
    path("me/", MyApplicationView.as_view(), name="driver-me"),
    path("toggle-online/", ToggleOnlineView.as_view(), name="driver-toggle-online"),
    path("stats/", DriverStatsView.as_view(), name="driver-stats"),
]
