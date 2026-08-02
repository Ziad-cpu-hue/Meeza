from rest_framework import serializers
from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    sender_display = serializers.CharField(source="get_sender_display", read_only=True)

    class Meta:
        model = Message
        fields = ["id", "sender", "sender_display", "text", "created_at"]


class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ["id", "created_at", "updated_at", "messages", "unread_count"]

    def get_unread_count(self, obj):
        return obj.messages.filter(sender="admin", is_read_by_user=False).count()


class ConversationListSerializer(serializers.ModelSerializer):
    """قائمة المحادثات للوحة تحكم المالك — تعرض آخر رسالة وعدد غير المقروء."""
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    user_type = serializers.CharField(source="user.user_type", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ["id", "user_name", "user_type", "user_email", "updated_at", "last_message", "unread_count"]

    def get_last_message(self, obj):
        last = obj.messages.last()
        return last.text[:80] if last else ""

    def get_unread_count(self, obj):
        return obj.messages.filter(sender="user", is_read_by_admin=False).count()
