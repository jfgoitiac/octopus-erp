from django.urls import path

# El backup se sirve ahora desde authentication.views.UserManagementViewSet.backup
# (POST /api/authentication/users/backup/). Ver nota de seguridad en usuarios/views.py.
urlpatterns = []