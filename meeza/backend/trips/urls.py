from django.urls import path
from .views import (
    TripCreateView, MyTripsView, TripDetailView, AvailableTripsView,
    AcceptTripView, IncreasePriceView, AdjustTripPriceView, AvailableCaptainsView,
    StartTripView, DriverLocationUpdateView, UploadPaymentProofView, CompleteTripView,
)

urlpatterns = [
    path("", TripCreateView.as_view(), name="trip-create"),
    path("mine/", MyTripsView.as_view(), name="trip-mine"),
    path("available/", AvailableTripsView.as_view(), name="trip-available"),
    path("<int:pk>/", TripDetailView.as_view(), name="trip-detail"),
    path("<int:pk>/accept/", AcceptTripView.as_view(), name="trip-accept"),
    path("<int:pk>/increase-price/", IncreasePriceView.as_view(), name="trip-increase-price"),
    path("<int:pk>/adjust-price/", AdjustTripPriceView.as_view(), name="trip-adjust-price"),
    path("<int:pk>/available-captains/", AvailableCaptainsView.as_view(), name="trip-available-captains"),
    path("<int:pk>/start/", StartTripView.as_view(), name="trip-start"),
    path("<int:pk>/location/", DriverLocationUpdateView.as_view(), name="trip-location"),
    path("<int:pk>/upload-payment-proof/", UploadPaymentProofView.as_view(), name="trip-upload-payment-proof"),
    path("<int:pk>/complete/", CompleteTripView.as_view(), name="trip-complete"),
]
