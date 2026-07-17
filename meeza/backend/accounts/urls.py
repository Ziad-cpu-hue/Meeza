from django.urls import path
from .views import RegisterView, LoginView, GoogleLoginView, AdminLoginView, MeView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("google/", GoogleLoginView.as_view(), name="google-login"),
    path("admin-login/", AdminLoginView.as_view(), name="admin-login"),
    path("me/", MeView.as_view(), name="me"),
]
