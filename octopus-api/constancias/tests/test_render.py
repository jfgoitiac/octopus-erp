"""
Tests del motor de render de constancias (constancias/render.py).

Es un módulo puro (no toca base de datos ni modelos Django), así que se
prueba con unittest.TestCase en vez de django.test.TestCase.
"""

import unittest

from constancias.render import (
    importar_notacion_vieja,
    renderizar_plantilla,
)


class RenderizarPlantillaTokenDesconocidoTests(unittest.TestCase):
    """1. Token inexistente en el diccionario de datos."""

    def test_token_inexistente_se_reemplaza_por_vacio_y_agrega_advertencia(self):
        html = "<p>Hola {{alumno.nombres}}, tu grado es {{alumno.grado}}</p>"
        datos = {"alumno": {"nombres": "Ana"}}  # falta 'grado'

        resultado, advertencias = renderizar_plantilla(html, datos, sexo="F")

        self.assertEqual(resultado, "<p>Hola Ana, tu grado es </p>")
        self.assertEqual(len(advertencias), 1)
        self.assertIn("alumno.grado", advertencias[0])

    def test_grupo_inexistente_no_lanza_excepcion(self):
        html = "{{institucion.nombre}}"
        datos = {"alumno": {"nombres": "Ana"}}  # ni siquiera existe 'institucion'

        # No debe lanzar excepción de ningún tipo.
        resultado, advertencias = renderizar_plantilla(html, datos)

        self.assertEqual(resultado, "")
        self.assertEqual(len(advertencias), 1)

    def test_datos_vacios_no_lanza_excepcion(self):
        html = "{{alumno.nombres}} - {{trabajador.cargo}}"
        resultado, advertencias = renderizar_plantilla(html, {})

        self.assertEqual(resultado, " - ")
        self.assertEqual(len(advertencias), 2)


class RenderizarPlantillaSexoTests(unittest.TestCase):
    """2. Persona sin sexo cargado (sexo=None)."""

    def test_sexo_none_usa_primera_variante_y_agrega_advertencia(self):
        html = "{{sexo:Aprobado|Aprobada}} el estudiante."
        datos = {}

        resultado, advertencias = renderizar_plantilla(html, datos, sexo=None)

        self.assertEqual(resultado, "Aprobado el estudiante.")
        self.assertEqual(len(advertencias), 1)
        self.assertIn("sexo", advertencias[0].lower())

    def test_sexo_ausente_en_diccionario_usa_primera_variante(self):
        # No se pasa parámetro `sexo` ni existe la clave `_sexo` en datos.
        html = "{{sexo:el representante|la representante}}"
        datos = {"alumno": {"nombres": "Luis"}}

        resultado, advertencias = renderizar_plantilla(html, datos)

        self.assertEqual(resultado, "el representante")
        self.assertEqual(len(advertencias), 1)

    def test_sexo_masculino_usa_variante_a(self):
        html = "{{sexo:aprobado|aprobada}}"
        resultado, advertencias = renderizar_plantilla(html, {}, sexo="M")

        self.assertEqual(resultado, "aprobado")
        self.assertEqual(advertencias, [])

    def test_sexo_femenino_usa_variante_b(self):
        html = "{{sexo:aprobado|aprobada}}"
        resultado, advertencias = renderizar_plantilla(html, {}, sexo="F")

        self.assertEqual(resultado, "aprobada")
        self.assertEqual(advertencias, [])

    def test_sexo_via_clave_datos_sexo(self):
        html = "{{sexo:él|ella}}"
        datos = {"_sexo": "F"}

        resultado, advertencias = renderizar_plantilla(html, datos)

        self.assertEqual(resultado, "ella")
        self.assertEqual(advertencias, [])

    def test_sexo_valor_inesperado_usa_variante_a_por_defecto(self):
        html = "{{sexo:aprobado|aprobada}}"
        resultado, advertencias = renderizar_plantilla(html, {}, sexo="X")

        self.assertEqual(resultado, "aprobado")
        self.assertEqual(len(advertencias), 1)


class NotacionViejaTests(unittest.TestCase):
    """3. Conversión de notación vieja ❴❴campo❵❵ a la nueva notación."""

    def test_campo_no_ambiguo_alumno(self):
        texto = "El alumno cursa ❴❴grado❵❵ en el nivel ❴❴nivel❵❵."
        resultado = importar_notacion_vieja(texto, destinatario="alumno")

        self.assertEqual(
            resultado,
            "El alumno cursa {{alumno.grado}} en el nivel {{alumno.nivel}}.",
        )

    def test_campo_ambiguo_apellidos_nombres_destinatario_alumno(self):
        texto = "❴❴nombres❵❵ ❴❴apellidos❵❵, CI ❴❴CI❵❵"
        resultado = importar_notacion_vieja(texto, destinatario="alumno")

        self.assertEqual(
            resultado,
            "{{alumno.nombres}} {{alumno.apellidos}}, CI {{alumno.cedula}}",
        )

    def test_campo_ambiguo_destinatario_trabajador(self):
        texto = "❴❴nombres❵❵ ❴❴apellidos❵❵, cargo: ❴❴cargo❵❵, CI ❴❴CI❵❵"
        resultado = importar_notacion_vieja(texto, destinatario="trabajador")

        self.assertEqual(
            resultado,
            "{{trabajador.nombres}} {{trabajador.apellidos}}, cargo: {{trabajador.cargo}}, CI {{trabajador.cedula}}",
        )

    def test_campo_familia(self):
        texto = "Madre: ❴❴nombresmadre❵❵ ❴❴apellidosmadre❵❵ (❴❴cimadre❵❵)"
        resultado = importar_notacion_vieja(texto, destinatario="alumno")

        self.assertEqual(
            resultado,
            "Madre: {{familia.madre_nombres}} {{familia.madre_apellidos}} ({{familia.madre_cedula}})",
        )

    def test_campo_desconocido_se_deja_intacto(self):
        texto = "❴❴campoinventado❵❵"
        resultado = importar_notacion_vieja(texto, destinatario="alumno")

        self.assertEqual(resultado, "❴❴campoinventado❵❵")

    def test_notacion_vieja_no_confunde_llaves_normales(self):
        # Llaves normales {} no deben ser tocadas por el importador.
        texto = "Esto {no} es notación vieja, pero ❴❴edad❵❵ sí."
        resultado = importar_notacion_vieja(texto, destinatario="alumno")

        self.assertEqual(resultado, "Esto {no} es notación vieja, pero {{alumno.edad}} sí.")

    def test_importar_y_luego_renderizar_flujo_completo(self):
        texto_viejo = "❴❴nombres❵❵ ❴❴apellidos❵❵, grado ❴❴grado❵❵"
        texto_nuevo = importar_notacion_vieja(texto_viejo, destinatario="alumno")
        datos = {"alumno": {"nombres": "Carla", "apellidos": "Gómez", "grado": "5to"}}

        resultado, advertencias = renderizar_plantilla(texto_nuevo, datos, sexo="F")

        self.assertEqual(resultado, "Carla Gómez, grado 5to")
        self.assertEqual(advertencias, [])


class CedulaTests(unittest.TestCase):
    """Formateo de cédula (helper reutilizado, un solo lugar en el motor)."""

    def test_cedula_con_nacionalidad_formatea_correctamente(self):
        html = "CI: {{alumno.cedula}}"
        datos = {"alumno": {"cedula": {"numero": "12345678", "nacionalidad": "V"}}}

        resultado, advertencias = renderizar_plantilla(html, datos)

        self.assertEqual(resultado, "CI: V-12345678")
        self.assertEqual(advertencias, [])

    def test_cedula_extranjera(self):
        html = "{{trabajador.cedula}}"
        datos = {"trabajador": {"cedula": {"numero": "9988776", "nacionalidad": "E"}}}

        resultado, _ = renderizar_plantilla(html, datos)

        self.assertEqual(resultado, "E-9988776")

    def test_cedula_sin_nacionalidad_usa_v_por_defecto(self):
        html = "{{familia.madre_cedula}}"
        datos = {"familia": {"madre_cedula": {"numero": "555111"}}}

        resultado, _ = renderizar_plantilla(html, datos)

        self.assertEqual(resultado, "V-555111")

    def test_cedula_ausente_usa_v_guion_default(self):
        html = "{{institucion.firmante_cedula}}"
        datos = {}

        resultado, advertencias = renderizar_plantilla(html, datos)

        self.assertEqual(resultado, "")  # token no encontrado -> vacío, no "V-"
        self.assertEqual(len(advertencias), 1)

    def test_cedula_valor_no_dict_usa_v_default(self):
        html = "{{alumno.cedula}}"
        datos = {"alumno": {"cedula": "12345678"}}  # forma no esperada, sin dict

        resultado, _ = renderizar_plantilla(html, datos)

        self.assertEqual(resultado, "V-12345678")


class InyeccionTests(unittest.TestCase):
    """4. Intento de inyección vía valor de un dato."""

    def test_valor_con_script_no_se_ejecuta_ni_se_interpreta_como_plantilla(self):
        html = "<p>Nombre: {{alumno.nombres}}</p><p>Grado: {{alumno.grado}}</p>"
        datos = {
            "alumno": {
                "nombres": "<script>alert(1)</script>",
                "grado": "5to",
            }
        }

        resultado, advertencias = renderizar_plantilla(html, datos)

        # El contenido malicioso se inserta tal cual, como texto (la
        # sanitización de HTML es responsabilidad de otra capa), pero el
        # motor no debe ejecutarlo ni tratarlo como plantilla.
        self.assertIn("<script>alert(1)</script>", resultado)
        # El siguiente token (grado) se sustituye con normalidad: el valor
        # inyectado no rompe ni "roba" la sustitución de otros tokens.
        self.assertIn("Grado: 5to", resultado)
        self.assertEqual(advertencias, [])

    def test_valor_que_contiene_un_token_no_se_reevalua(self):
        # Si el VALOR de un dato contiene algo con forma de token
        # ({{alumno.cedula}}), el motor no debe volver a sustituirlo: debe
        # quedar como texto literal en la salida.
        html = "{{alumno.nombres}}"
        datos = {"alumno": {"nombres": "{{alumno.cedula}}"}}

        resultado, advertencias = renderizar_plantilla(html, datos)

        self.assertEqual(resultado, "{{alumno.cedula}}")
        self.assertEqual(advertencias, [])

    def test_atributo_onerror_en_valor_se_inserta_como_texto_literal(self):
        html = "<img src=x>{{alumno.nombres}}"
        datos = {"alumno": {"nombres": '"><img src=x onerror=alert(1)>'}}

        resultado, advertencias = renderizar_plantilla(html, datos)

        self.assertIn('"><img src=x onerror=alert(1)>', resultado)
        self.assertEqual(advertencias, [])


if __name__ == "__main__":
    unittest.main()
