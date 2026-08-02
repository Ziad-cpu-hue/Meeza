# Generated manually — إضافة حالة "ongoing" (جارٍ تنفيذ الرحلة) بين "accepted" و"completed"
# عشان نفرّق بين الكابتن وهو في الطريق للعميل، والكابتن وهو بياخد العميل للوجهة.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('trips', '0002_trip_bonus_amount_trip_commission_settled_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='trip',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'بانتظار كابتن'),
                    ('accepted', 'الكابتن في الطريق إليك'),
                    ('ongoing', 'جارٍ تنفيذ الرحلة'),
                    ('completed', 'مكتملة'),
                    ('cancelled', 'ملغاة'),
                ],
                default='pending',
                max_length=10,
            ),
        ),
    ]
