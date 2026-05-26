from django.http import FileResponse
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import subprocess
import os
from .models import LogAuditoria
from .serializers import LogAuditoriaSerializer
from authentication.serializers import UserSerializer
import sys # Import sys

class AuditoriaListView(generics.ListAPIView):
    queryset = LogAuditoria.objects.all().order_by('-fecha_hora')
    serializer_class = LogAuditoriaSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Restricción de seguridad: Solo el director puede ver logs
        perfil = getattr(self.request.user, 'perfil', None)
        if not self.request.user.is_superuser and (not perfil or perfil.rol != 'director'):
            return LogAuditoria.objects.none()
        
        # Opcional: Filtrar por módulo o usuario mediante parámetros URL
        modulo = self.request.query_params.get('modulo')
        if modulo:
            return LogAuditoria.objects.filter(modulo=modulo).order_by('-fecha_hora')
        return super().get_queryset()

# Removed UserListView, UserCreateView, UserDeleteView, UserResetPasswordView
# These are now handled by authentication.views.UserManagementViewSet

class DatabaseBackupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        perfil = getattr(request.user, 'perfil', None)
        # Only allow superusers or users with 'director' or 'sistemas' roles
        if not request.user.is_superuser and (not perfil or perfil.rol not in ['director', 'sistemas', 'administrador']):
            return Response({'error': 'No autorizado'}, status=status.HTTP_403_FORBIDDEN)
        
        try:
            # Get the path to manage.py dynamically
            manage_py_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'manage.py')
            
            # Ejecutar dumpdata
            result = subprocess.run([
                sys.executable, # Use the python executable from the current environment
                manage_py_path,
                'dumpdata', 
                '--exclude=auth.permission', 
                '--exclude=contenttypes',
                '--indent=2' # Make the JSON output readable
            ], capture_output=True, text=True, check=True) # check=True will raise CalledProcessError on non-zero exit codes
            
            # Guardar en un archivo
            backup_file = f'backup_{request.user.username}_{request.data.get("fecha", "manual")}.json'
            file_path = os.path.join(os.getcwd(), backup_file) 
            with open(file_path, 'w') as f:
                f.write(result.stdout)
            
            # Retornar el archivo como respuesta (FileResponse de django.http)
            return FileResponse(open(file_path, 'rb'), as_attachment=True, filename=backup_file)
        except subprocess.CalledProcessError as e:
            return Response({'error': f'Error en dumpdata: {e.stderr}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)