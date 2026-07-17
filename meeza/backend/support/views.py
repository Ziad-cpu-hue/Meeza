from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Conversation, Message
from .serializers import ConversationSerializer, ConversationListSerializer, MessageSerializer


class MyConversationView(APIView):
    """محادثة الدعم الخاصة بالمستخدم الحالي (عميل أو كابتن) — تُنشأ تلقائياً أول مرة."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        conversation, _ = Conversation.objects.get_or_create(user=request.user)
        # اعتبر رسائل الإدارة "مقروءة" بمجرد ما المستخدم يفتح المحادثة
        conversation.messages.filter(sender="admin", is_read_by_user=False).update(is_read_by_user=True)
        return Response(ConversationSerializer(conversation).data)

    def post(self, request):
        text = (request.data.get("text") or "").strip()
        if not text:
            return Response({"detail": "الرسالة فارغة"}, status=400)
        conversation, _ = Conversation.objects.get_or_create(user=request.user)
        message = Message.objects.create(conversation=conversation, sender="user", text=text)
        conversation.save(update_fields=["updated_at"])
        return Response(MessageSerializer(message).data, status=201)


class AdminConversationListView(APIView):
    """كل محادثات الدعم — للوحة تحكم المالك فقط."""
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        conversations = Conversation.objects.all()
        return Response(ConversationListSerializer(conversations, many=True).data)


class AdminConversationDetailView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request, pk):
        try:
            conversation = Conversation.objects.get(pk=pk)
        except Conversation.DoesNotExist:
            return Response({"detail": "المحادثة غير موجودة"}, status=404)
        conversation.messages.filter(sender="user", is_read_by_admin=False).update(is_read_by_admin=True)
        return Response(ConversationSerializer(conversation).data)


class AdminReplyView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        text = (request.data.get("text") or "").strip()
        if not text:
            return Response({"detail": "الرسالة فارغة"}, status=400)
        try:
            conversation = Conversation.objects.get(pk=pk)
        except Conversation.DoesNotExist:
            return Response({"detail": "المحادثة غير موجودة"}, status=404)
        message = Message.objects.create(conversation=conversation, sender="admin", text=text)
        conversation.save(update_fields=["updated_at"])
        return Response(MessageSerializer(message).data, status=201)
