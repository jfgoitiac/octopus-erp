"""
Tests del módulo de Comunicación (Fase 2 — Circulares).

Cubren:
  - Publicar una circular crea una LecturaCircular por cada RepresentanteUser
    activo (broadcast completo) y ninguna para los inactivos.
  - Confirmar lectura marca leido=True y setea fecha_lectura.
  - Solo director/sistemas/administrador pueden publicar circulares.
  - Un representante solo ve/confirma sus propias lecturas (aislamiento).
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from academico.models import Materia
from portal.models import RepresentanteUser, asignar_rol_portal
from secretaria.models import Alumno, Representante

from .models import Circular, LecturaCircular, MensajeDirecto

User = get_user_model()


def crear_usuario(username, rol, password='clave-segura-123'):
    user = User.objects.create_user(username=username, password=password)
    user.perfil.rol = rol
    user.perfil.save(update_fields=['rol'])
    return user


def crear_representante_con_portal(cedula, correo, esta_activo=True):
    rep = Representante.objects.create(
        cedula=cedula, nombre='Maria', apellido='Gonzalez',
        telefono='04141234567', correo=correo, direccion='Av. Principal',
    )
    user = User.objects.create_user(username=cedula, password='clave-segura-123', email=correo)
    rep_user = RepresentanteUser.objects.create(representante=rep, user=user, esta_activo=esta_activo)
    asignar_rol_portal(user)
    return rep, user, rep_user


def crear_alumno_de(representante, cedula_escolar, grado_seccion='1er Grado A'):
    return Alumno.objects.create(
        representante=representante,
        cedula_escolar=cedula_escolar,
        nombre='Pedro', apellido='Gonzalez',
        fecha_nacimiento=date(2015, 3, 10),
        grado_seccion=grado_seccion,
    )


class PublicarCircularTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.director = crear_usuario('director1', 'director')
        self.docente = crear_usuario('docente1', 'docente')
        _, _, self.rep_user_activo = crear_representante_con_portal('V1111', 'rep1@example.com', esta_activo=True)
        _, _, self.rep_user_inactivo = crear_representante_con_portal('V2222', 'rep2@example.com', esta_activo=False)

    def test_director_publica_circular_crea_lecturas_solo_para_activos(self):
        self.client.force_authenticate(user=self.director)
        resp = self.client.post('/api/comunicacion/circulares/', {
            'titulo': 'Reunión de padres',
            'cuerpo': 'Se convoca a todos los representantes.',
            'requiere_confirmacion': True,
        }, format='multipart')
        self.assertEqual(resp.status_code, 201, resp.content)

        circular = Circular.objects.get()
        self.assertEqual(circular.publicado_por, self.director)
        lecturas = LecturaCircular.objects.filter(circular=circular)
        self.assertEqual(lecturas.count(), 1)
        self.assertEqual(lecturas.first().usuario, self.rep_user_activo)
        self.assertFalse(
            LecturaCircular.objects.filter(circular=circular, usuario=self.rep_user_inactivo).exists()
        )

    def test_docente_no_puede_publicar_circular(self):
        self.client.force_authenticate(user=self.docente)
        resp = self.client.post('/api/comunicacion/circulares/', {
            'titulo': 'Aviso', 'cuerpo': 'Cuerpo',
        }, format='multipart')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(Circular.objects.count(), 0)


class ConfirmarLecturaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.director = crear_usuario('director2', 'director')
        _, self.user_a, self.rep_user_a = crear_representante_con_portal('V3333', 'repA@example.com')
        _, self.user_b, self.rep_user_b = crear_representante_con_portal('V4444', 'repB@example.com')

        self.circular = Circular.objects.create(
            titulo='Calendario de evaluaciones', cuerpo='Ver anexo.',
            publicado_por=self.director, requiere_confirmacion=True,
        )
        self.lectura_a = LecturaCircular.objects.create(circular=self.circular, usuario=self.rep_user_a)
        self.lectura_b = LecturaCircular.objects.create(circular=self.circular, usuario=self.rep_user_b)

    def test_representante_confirma_su_propia_lectura(self):
        self.client.force_authenticate(user=self.user_a)
        resp = self.client.post(f'/api/portal/comunicacion/circulares/{self.circular.id}/confirmar/')
        self.assertEqual(resp.status_code, 200, resp.content)

        self.lectura_a.refresh_from_db()
        self.assertTrue(self.lectura_a.leido)
        self.assertIsNotNone(self.lectura_a.fecha_lectura)

        # La lectura del otro representante no se ve afectada (aislamiento).
        self.lectura_b.refresh_from_db()
        self.assertFalse(self.lectura_b.leido)

    def test_listado_portal_incluye_estado_de_lectura(self):
        self.client.force_authenticate(user=self.user_a)
        resp = self.client.get('/api/portal/comunicacion/circulares/')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data), 1)
        self.assertFalse(resp.data[0]['leido'])

    def test_director_ve_quien_leyo(self):
        self.client.force_authenticate(user=self.user_b)
        self.client.post(f'/api/portal/comunicacion/circulares/{self.circular.id}/confirmar/')

        self.client.force_authenticate(user=self.director)
        resp = self.client.get(f'/api/comunicacion/circulares/{self.circular.id}/lecturas/')
        self.assertEqual(resp.status_code, 200, resp.content)
        leidos = [l for l in resp.data if l['leido']]
        self.assertEqual(len(leidos), 1)
        self.assertEqual(leidos[0]['representante_cedula'], 'V4444')


class MensajeDirectoTests(TestCase):
    """Fase 3 -- mensajería bidireccional. El docente siempre inicia la
    conversación; el representante solo puede responder."""

    def setUp(self):
        self.client = APIClient()
        self.docente = crear_usuario('docenteM1', 'docente')
        self.rep, self.rep_django_user, self.rep_user = crear_representante_con_portal(
            'V5555', 'repM@example.com'
        )
        self.alumno = crear_alumno_de(self.rep, 'E90000001', grado_seccion='6to Grado A')
        Materia.objects.create(nombre='Ciencias', grado_seccion='6to Grado A', docente=self.docente, activa=True)

        self.rep_sin_portal = Representante.objects.create(
            cedula='V6666', nombre='Juan', apellido='Perez',
            telefono='04140000000', correo='sinportal@example.com', direccion='Otra dirección',
        )
        self.alumno_sin_portal = crear_alumno_de(self.rep_sin_portal, 'E90000002', grado_seccion='6to Grado A')

        self.rep_otra_seccion, _, self.rep_user_otra_seccion = crear_representante_con_portal(
            'V7777', 'otra@example.com'
        )
        self.alumno_otra_seccion = crear_alumno_de(
            self.rep_otra_seccion, 'E90000003', grado_seccion='2do Grado B'
        )

    def test_docente_inicia_conversacion(self):
        self.client.force_authenticate(user=self.docente)
        resp = self.client.post('/api/comunicacion/mensajes/', {
            'alumno_id': self.alumno.id,
            'cuerpo': 'Buenos días, Juan olvidó entregar la tarea.',
        }, format='multipart')
        self.assertEqual(resp.status_code, 201, resp.content)
        mensaje = MensajeDirecto.objects.get()
        self.assertEqual(mensaje.remitente_docente, self.docente)
        self.assertEqual(mensaje.destinatario_representante, self.rep_user)

    def test_docente_no_puede_iniciar_conversacion_fuera_de_su_seccion(self):
        self.client.force_authenticate(user=self.docente)
        resp = self.client.post('/api/comunicacion/mensajes/', {
            'alumno_id': self.alumno_otra_seccion.id,
            'cuerpo': 'No debería poder enviar esto.',
        }, format='multipart')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(MensajeDirecto.objects.count(), 0)

    def test_docente_no_puede_escribir_a_alumno_sin_portal_activo(self):
        self.client.force_authenticate(user=self.docente)
        resp = self.client.post('/api/comunicacion/mensajes/', {
            'alumno_id': self.alumno_sin_portal.id,
            'cuerpo': 'El representante no tiene portal.',
        }, format='multipart')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(MensajeDirecto.objects.count(), 0)

    def test_representante_no_puede_iniciar_conversacion_en_frio(self):
        self.client.force_authenticate(user=self.rep_django_user)
        resp = self.client.post('/api/portal/comunicacion/mensajes/', {
            'alumno_id': self.alumno.id,
            'cuerpo': 'Quiero preguntar algo sin que nadie me haya escrito.',
        }, format='multipart')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(MensajeDirecto.objects.count(), 0)

    def test_representante_responde_conversacion_iniciada_por_docente(self):
        MensajeDirecto.objects.create(
            alumno=self.alumno, remitente_docente=self.docente,
            destinatario_representante=self.rep_user, cuerpo='Mensaje inicial del docente.',
        )
        self.client.force_authenticate(user=self.rep_django_user)
        resp = self.client.post('/api/portal/comunicacion/mensajes/', {
            'alumno_id': self.alumno.id,
            'cuerpo': 'Gracias por avisar, hablaré con él.',
        }, format='multipart')
        self.assertEqual(resp.status_code, 201, resp.content)
        respuesta = MensajeDirecto.objects.get(remitente_representante=self.rep_user)
        self.assertEqual(respuesta.destinatario_docente, self.docente)

    def test_docente_marca_mensaje_leido(self):
        mensaje = MensajeDirecto.objects.create(
            alumno=self.alumno, remitente_representante=self.rep_user,
            destinatario_docente=self.docente, cuerpo='Consulta del representante.',
        )
        self.client.force_authenticate(user=self.docente)
        resp = self.client.patch(f'/api/comunicacion/mensajes/{mensaje.id}/leer/')
        self.assertEqual(resp.status_code, 200, resp.content)
        mensaje.refresh_from_db()
        self.assertTrue(mensaje.leido)

    def test_bandeja_docente_no_muestra_mensajes_de_otro_docente(self):
        otro_docente = crear_usuario('docenteM2', 'docente')
        MensajeDirecto.objects.create(
            alumno=self.alumno, remitente_docente=self.docente,
            destinatario_representante=self.rep_user, cuerpo='De docente 1.',
        )
        self.client.force_authenticate(user=otro_docente)
        resp = self.client.get('/api/comunicacion/mensajes/')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data), 0)
