from django.urls import path
from .views import DatabaseBackupView

urlpatterns = [
    path('backup/', DatabaseBackupView.as_view(), name='database-backup'),
]