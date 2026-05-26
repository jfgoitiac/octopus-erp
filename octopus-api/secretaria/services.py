import datetime
import random
import logging
from django.core.mail import EmailMessage
from django.conf import settings
from secretaria.models import Alumno
from usuarios.models import LogAuditoria

# Configuración del logger para rastrear fallos en envíos
logger = logging.getLogger(__name__)

class NotificadorService:
    @staticmethod
    def enviar_correo(destinatario, asunto, cuerpo, attachment=None):
        """
        Servicio base para el envío de correos electrónicos.
        Soporta parámetros clave y archivos adjuntos opcionales.
        """
        try:
            email = EmailMessage(
                subject=asunto,
                body=cuerpo,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[destinatario],
            )

            # Si se proporciona un adjunto, se espera una tupla: (nombre, contenido, mimetype)
            if attachment:
                email.attach(*attachment)

            # El método send() utiliza automáticamente EMAIL_HOST, EMAIL_PORT, etc. de settings.py
            email.send(fail_silently=False)
            return True

        except Exception as e:
            # Registramos el error en el logger sin detener la ejecución del hilo principal
            logger.error(f"Error crítico al enviar correo a {destinatario}: {str(e)}")
            return False

    @staticmethod
    def enviar_recibo_pago(pago):
        """
        Lógica específica para notificar un registro de pago.
        """
        asunto = f"Recibo de Pago Confirmado #{pago.id} - Colegio Octopus"
        cuerpo = (
            f"Hola {pago.alumno.representante.nombre},\n\n"
            f"Hemos registrado exitosamente el pago por concepto de: {pago.get_concepto_display()}.\n"
            f"Monto: {pago.monto_usd} USD / {pago.monto_ves} VES.\n"
            f"Referencia: {pago.referencia or 'Efectivo'}\n\n"
            "Gracias por su compromiso con la institución."
        )
        destinatario = pago.alumno.representante.correo
        
        return NotificadorService.enviar_correo(destinatario, asunto, cuerpo)

def generate_temporary_cedula_escolar(request_user):
    """
    Genera un ID numérico temporal/virtual único para estudiantes sin cédula.
    Formato: 99 + YYYYMMDD + HHMMSS + RRRR (random 4 dígitos)
    Ejemplo: 99202310261530451234
    """
    while True:
        now = datetime.datetime.now()
        timestamp_part = now.strftime("%Y%m%d%H%M%S")
        random_part = str(random.randint(0, 9999)).zfill(4) # Asegura 4 dígitos, rellenando con ceros si es necesario
        
        generated_id = f"99{timestamp_part}{random_part}"
        
        # Verifica la unicidad en la base de datos (extremadamente improbable que se repita)
        if not Alumno.objects.filter(cedula_escolar=generated_id).exists():
            return generated_id