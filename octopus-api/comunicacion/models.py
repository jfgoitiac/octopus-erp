from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


def validar_tamano_adjunto(archivo):
    limite_mb = 5
    if archivo.size > limite_mb * 1024 * 1024:
        raise ValidationError(f'El adjunto no puede superar {limite_mb}MB.')


class Circular(models.Model):
    """
    Comunicado unidireccional del colegio hacia los representantes
    (circulares, avisos institucionales). La mensajería bidireccional
    docente<->representante queda para Fase 3.
    """
    titulo = models.CharField(max_length=255)
    cuerpo = models.TextField()
    adjunto = models.FileField(
        upload_to='circulares/', blank=True, null=True,
        validators=[validar_tamano_adjunto],
    )
    publicado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='circulares_publicadas',
    )
    fecha_publicacion = models.DateTimeField(auto_now_add=True)
    requiere_confirmacion = models.BooleanField(default=False)

    class Meta:
        ordering = ['-fecha_publicacion']

    def __str__(self):
        return self.titulo


class LecturaCircular(models.Model):
    """
    Relación circular <-> representante con estado de lectura. Se crea una
    fila por cada RepresentanteUser activo al momento de publicar la circular
    (broadcast completo, sin segmentación por grado/sección en esta fase).
    """
    circular = models.ForeignKey(Circular, on_delete=models.CASCADE, related_name='lecturas')
    usuario = models.ForeignKey('portal.RepresentanteUser', on_delete=models.CASCADE, related_name='lecturas_circulares')
    leido = models.BooleanField(default=False)
    fecha_lectura = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('circular', 'usuario')

    def __str__(self):
        estado = 'leído' if self.leido else 'no leído'
        return f"{self.circular.titulo} — {self.usuario} ({estado})"


class MensajeDirecto(models.Model):
    """
    Mensajería bidireccional docente <-> representante sobre un alumno
    puntual. El docente siempre inicia la conversación (ver
    comunicacion/views.py::MensajeDirectoListCreateView.post); el
    representante solo puede responder dentro de una conversación ya
    iniciada (ver MensajeDirectoPortalListCreateView.post).
    """
    alumno = models.ForeignKey('secretaria.Alumno', on_delete=models.CASCADE, related_name='mensajes_directos')

    remitente_docente = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='mensajes_enviados',
    )
    remitente_representante = models.ForeignKey(
        'portal.RepresentanteUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='mensajes_enviados',
    )
    destinatario_docente = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+',
    )
    destinatario_representante = models.ForeignKey(
        'portal.RepresentanteUser', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+',
    )

    cuerpo = models.TextField()
    adjunto = models.FileField(
        upload_to='mensajes/', blank=True, null=True,
        validators=[validar_tamano_adjunto],
    )
    leido = models.BooleanField(default=False)
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['fecha']
        constraints = [
            # Exactamente un remitente (docente XOR representante) — igual de
            # estricto que el patrón de constraints condicionales que ya usa
            # ComprobantePago en portal/models.py.
            models.CheckConstraint(
                condition=(
                    (models.Q(remitente_docente__isnull=False) & models.Q(remitente_representante__isnull=True))
                    | (models.Q(remitente_docente__isnull=True) & models.Q(remitente_representante__isnull=False))
                ),
                name='mensaje_un_solo_remitente',
            ),
        ]

    def __str__(self):
        return f"Mensaje sobre {self.alumno} — {self.fecha:%Y-%m-%d %H:%M}"
