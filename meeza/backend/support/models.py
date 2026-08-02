from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """محادثة دعم واحدة بين مستخدم (عميل أو كابتن) وإدارة المنصة."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="support_conversation"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"محادثة مع {self.user.full_name or self.user.email}"


class Message(models.Model):
    """رسالة واحدة داخل محادثة دعم."""

    class Sender(models.TextChoices):
        USER = "user", "المستخدم"
        ADMIN = "admin", "الإدارة"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.CharField(max_length=10, choices=Sender.choices)
    text = models.TextField()
    is_read_by_admin = models.BooleanField(default=False)
    is_read_by_user = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.get_sender_display()}: {self.text[:30]}"
