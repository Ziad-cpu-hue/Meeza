"""مسارات مشروع ميزة الرئيسية"""
import os
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import Http404
from django.urls import path, re_path, include
from django.views.static import serve as static_serve

# مجلد الفرونت إند (خارج مجلد backend مباشرة)
FRONTEND_DIR = settings.BASE_DIR.parent / "frontend"


def frontend_serve(request, path=""):
    """
    يقدّم ملفات الفرونت إند (HTML/CSS/JS) مباشرة من نفس سيرفر Django،
    عشان تقدر تشغل السيرفر مرة واحدة بس أثناء التطوير المحلي.
    """
    if path == "" or path.endswith("/"):
        path += "index.html"
    full_path = os.path.join(str(FRONTEND_DIR), path)
    if not os.path.isfile(full_path):
        raise Http404("الملف غير موجود")
    return static_serve(request, path, document_root=str(FRONTEND_DIR))


urlpatterns = [
    path("admin/", admin.site.urls),  # لوحة تحكم Django الإدارية (منفصلة عن لوحة تحكم المالك)
    path("api/auth/", include("accounts.urls")),
    path("api/drivers/", include("drivers.urls")),
    path("api/trips/", include("trips.urls")),
    path("api/pricing/", include("pricing.urls")),
    path("api/adminpanel/", include("adminpanel.urls")),
    path("api/support/", include("support.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    # تقديم الفرونت إند من نفس السيرفر أثناء التطوير المحلي فقط
    # لازم يكون آخر مسار في القائمة عشان ميتعارضش مع /api/ أو /admin/ أو /media/
    urlpatterns += [
        re_path(r"^(?P<path>.*)$", frontend_serve, name="frontend"),
    ]
