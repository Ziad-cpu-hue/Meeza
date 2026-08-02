from django.contrib.auth import get_user_model, authenticate
from rest_framework import status, generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from .serializers import RegisterSerializer, LoginSerializer, UserSerializer
from django.conf import settings

User = get_user_model()


def _token_response(user):
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": UserSerializer(user).data})


class RegisterView(generics.CreateAPIView):
    """تسجيل عميل جديد (تسجيل الكابتن يتم عبر drivers.apply لأنه يحتاج مستندات)."""
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save(user_type=User.UserType.CUSTOMER)
        return _token_response(user)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]
        try:
            user_obj = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response({"detail": "البريد الإلكتروني أو كلمة المرور غير صحيحة"}, status=400)
        user = authenticate(request, username=user_obj.username, password=password)
        if not user:
            return Response({"detail": "البريد الإلكتروني أو كلمة المرور غير صحيحة"}, status=400)
        return _token_response(user)


class GoogleLoginView(APIView):
    """تسجيل الدخول أو إنشاء حساب تلقائياً بواسطة جوجل (Google Identity Services)."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token = request.data.get("id_token")
        if not token:
            return Response({"detail": "id_token مطلوب"}, status=400)
        try:
            idinfo = google_id_token.verify_oauth2_token(
                token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
            )
        except Exception:
            return Response({"detail": "تعذر التحقق من حساب جوجل"}, status=400)

        email = idinfo.get("email")
        full_name = idinfo.get("name", "")
        if not email:
            return Response({"detail": "لا يوجد بريد إلكتروني مرتبط بحساب جوجل"}, status=400)

        user, created = User.objects.get_or_create(
            email__iexact=email,
            defaults={
                "email": email,
                "username": email,
                "full_name": full_name,
                "is_google_account": True,
                "user_type": User.UserType.CUSTOMER,
            },
        )
        if created:
            user.set_unusable_password()
            user.save()
        return _token_response(user)


class AdminLoginView(APIView):
    """دخول لوحة التحكم الخاصة بمالك المنصة (username + password، is_staff فقط)."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({"detail": "بيانات الدخول غير صحيحة أو لا تملك صلاحية الوصول"}, status=400)

        if not user.check_password(password) or not (user.is_staff or user.is_superuser):
            return Response({"detail": "بيانات الدخول غير صحيحة أو لا تملك صلاحية الوصول"}, status=400)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key})


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)
