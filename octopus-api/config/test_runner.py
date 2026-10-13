"""
Runner de pruebas: bloquea las llamadas salientes a la API de Meta (graph.facebook.com).

Los tests que ejercitan WhatsApp ya parchean `requests.post`/`requests.get` donde les
importa el resultado; las que se les escapan (por ejemplo señales que envían un recibo)
salían al proxy del entorno y quedaban en el log como 403. Aquí se cortan en
`requests.Session.send` y se responde 403 sin tocar la red: el comportamiento para el
código llamador es el mismo que tenía (fallo de envío) pero sin tráfico real.
"""
from unittest.mock import patch

import requests
from django.test.runner import DiscoverRunner

HOSTS_BLOQUEADOS = ('graph.facebook.com',)
_enviar_original = requests.Session.send


def _respuesta_bloqueada(request):
    r = requests.Response()
    r.status_code = 403
    r.url = request.url
    r.request = request
    r.reason = 'Bloqueado en pruebas'
    r._content = b'{"error": {"message": "Llamada a Meta bloqueada en pruebas"}}'
    r.headers['Content-Type'] = 'application/json'
    return r


def _send_sin_meta(self, request, **kwargs):
    if any(h in (request.url or '') for h in HOSTS_BLOQUEADOS):
        return _respuesta_bloqueada(request)
    return _enviar_original(self, request, **kwargs)


class RunnerSinMeta(DiscoverRunner):
    def run_tests(self, *args, **kwargs):
        with patch.object(requests.Session, 'send', _send_sin_meta):
            return super().run_tests(*args, **kwargs)
