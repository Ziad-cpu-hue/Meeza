from django.urls import path
from .views import (
    MyConversationView, AdminConversationListView,
    AdminConversationDetailView, AdminReplyView,
)

urlpatterns = [
    path("me/", MyConversationView.as_view(), name="support-me"),
    path("admin/conversations/", AdminConversationListView.as_view(), name="support-admin-list"),
    path("admin/conversations/<int:pk>/", AdminConversationDetailView.as_view(), name="support-admin-detail"),
    path("admin/conversations/<int:pk>/reply/", AdminReplyView.as_view(), name="support-admin-reply"),
]
