"""
Seed de alumnos de 1er Año con datos reales del Excel 'carnet 1eraño.xlsx'.
Uso: desde Django shell o management command.

    from secretaria.seed_primer_ano import ejecutar_seed
    ejecutar_seed()
"""

from datetime import date
from django.contrib.auth import get_user_model
from django.db import transaction

from secretaria.models import Alumno, Representante, ConfiguracionGrado, Inscripcion

User = get_user_model()

GRADO = "1er Año"

# Datos extraídos del Excel. Campos: nombre, apellido, rep_nombre, rep_apellido, cedula, telefono, correo
ALUMNOS = [
    ("MARIA",      "CABRERA",     "IRAIDA",    "CABRERA",     "12790416", "04146029336", "iraidacabreramedina71@gmail.com"),
    ("NICOLE",     "YAJURE",      "MAIBELIZ",  "SALAS",       "20679578", "04246433383", "salasmaibeliz@gmail.com"),
    ("CAMILA",     "RODRIGUEZ",   "MILAGROS",  "ALVAREZ",     "14303708", "04128717890", "milacoroalvarez1980@gmail.com"),
    ("GABRIELA",   "GARCIA",      "DAILENNYS", "REYES",       "25723374", "04126921050", "dailennyssrm@gmail.com"),
    ("LEONARDO",   "EVANGELSITA", "YOSMARY",   "ROMERO",      "13079593", "04124782625", "yosmaryromero@gmail.com"),
    ("DARIEXIS",   "AGUILAR",     "GREICY",    "JARAMILLO",   "20131448", "04123455603", "greicy_mar922@hotmail.com"),
    ("CLAIRET",    "PEREIRA",     "YOHANA",    "PEREIRA",     "16801984", "04244304195", "manuelamoreira05@gmail.com"),
    ("AZDRITT",    "SECO",        "DEANNYS",   "GARCIA",      "24596210", "04123554048", "deannysgarcia2014@gmail.com"),
    ("BRENDA",     "CABRERA",     "YOSELIN",   "NAVARRO",     "23677164", "04246544326", "yosmilagros2018@gmail.com"),
    ("SHANTAL",    "RIVAS",       "CAROLINA",  "GARCIA",      "13466614", "04127022596", "garcarola14@gmail.com"),
    ("JESUS",      "SANCHEZ",     "XIOMARA",   "DIAZ",        "12427717", "04141482839", "xiomaradiazseco20@gmail.com"),
    ("ENZO",       "PADILLA",     "GREGORIA",  "CORONEL",     "15703992", "04246516056", "gre.coronel@gmail.com"),
    ("ANGELYS",    "MEDINA",      "DEIMARY",   "ESCALONA",    "20132979", "04124603485", "deimaryjuliethel91@gmail.com"),
    ("LOREANNYS",  "LUGO",        "CARMEN",    "MARQUEZ",     "18890265", "04246168834", "loreangelyslugo@gmail.com"),
    ("JOSE",       "RIVERO",      "GREYSI",    "SANCHEZ",     "16568112", "04124420605", "grey1503@hotmail.com"),
    ("SOFIA",      "SILVA",       "YESSICA",   "HERRERA",     "18152615", "04124235739", "yessica.h2777@gmail.com"),
    ("NATHALIA",   "CARDOZO",     "MARIA",     "TRUJILLO",    "20131620", "04246082554", "mariatrinidatrujillograciete@gmail.com"),
    ("JOSHEP",     "BONIEL",      "ANGELICA",  "JIMENEZ",     "16521671", "04127598003", "joshemik30@gmail.com"),
    ("NICOLE",     "GONZALEZ",    "AMELIS",    "MORILLO",     "20688995", "04123426291", "nicari.idea@gmail.com"),
    ("AMELIA",     "RODRIGUEZ",   "GREINALY",  "ALDAMA",      "20931843", "04144011823", "aldamagreinaly@gmail.com"),
    ("MARIA",      "SANCHEZ",     "CARMEN",    "RODRIGUEZ",   "7130084",  "04125148916", "crosa2002@hotmail.com"),
    ("DOUGLAS",    "VILLANUEVA",  "DANIELA",   "UZCATEGUI",   "18890265", "04246168834", "danielauzcategui88@hotmail.com"),
    ("SOPHIA",     "AVILA",       "SAYLY",     "LEAL",        "16521497", "04244400134", "sayzlileal3@gmail.com"),
    ("NORKYS",     "GUTIERREZ",   "DANIELYS",  "QUERO",       "25470409", "04126018296", "danielisjosequeroaguilar@gmail.com"),
    ("CRISTHYAN",  "MAVAREZ",     "ARACELIS",  "CAMACHO",     "6559854",  "04246257276", "aracamacho06@gmail.com"),
    ("SOFIA",      "MELENDEZ",    "MARIA",     "GUTIERREZ",   "20157445", "04246084752", "mariaguthernandez@gmail.com"),
    ("JOSUE",      "MEJIAS",      "ARACELIS",  "ARTEAGA",     "12424424", "04121323176", "aracelisarteaga3@gmail.com"),
    ("DARYELIS",   "CABRERA",     "YOLIMAR",   "GARCIA",      "23677055", "04127430079", "yolimargan23.g@gmail.com"),
    ("FREDDY",     "ALBORNOZ",    "DAISY",     "NARANJO",     "19197758", "04246631245", "daisynaranjopaez@gmail.com"),
    ("ANGELA",     "HERNANDEZ",   "LOURDES",   "CHIRINO",     "15482356", "04124674905", "lourdesch231079@gmail.com"),
    ("LORENA",     "BARRETO",     "LOURDES",   "CHIRINO",     "15482356", "04124674905", "lourdesch231079@gmail.com"),
    ("JOSE",       "QUINTERO",    "JOSE",      "QUINTERO",    "15225692", "04122576046", "josequinteroalvarez2019@gmail.com"),
    ("VICTOR",     "CHIRINOS",    "INGRID",    "OSORIO",      "24704708", "04128526890", "margartmolina@gmail.com"),
    ("KEREN",      "HERNANDEZ",   "AURA",      "MORILLO",     "14794825", "04126797022", "jesushromero@gmail.com"),
    ("NATHANAEL",  "RODRIGUEZ",   "NIKARIS",   "ARRAEZ",      "18048004", "04124109417", "nikarisarraez@gmail.com"),
    ("SOFIA",      "HERRERA",     "MARIELI",   "UZCATEGUI",   "20131537", "04246421539", "marielisuzcategui26@gmail.com"),
    ("JESUS",      "CORDOBA",     "EIDA",      "CORONEL",     "14796461", "04125265658", "eidacoronel99@gmail.com"),
    ("JEAN",       "HERNANDEZ",   "ANARELYS",  "PRIETO",      "19789958", "04120340524", "anap160690@gmail.com"),
    ("ALEXANDER",  "SANCHEZ",     "ALEXA",     "PACHANO",     "17824081", "04125034109", "alexa.pachano1530@gmail.com"),
]

# Nombres que estadísticamente son masculinos en Venezuela
NOMBRES_MASCULINOS = {
    "LEONARDO", "JESUS", "ENZO", "JOSE", "JOSHEP",
    "DOUGLAS", "JOSUE", "FREDDY", "VICTOR", "CRISTHYAN",
    "NATHANAEL", "JEAN", "ALEXANDER",
}


def _limpiar_cedula(cedula: str) -> str:
    digits = "".join(c for c in str(cedula) if c.isdigit())
    return f"V-{digits}"


def _inferir_genero(nombre: str) -> str:
    return "masculino" if nombre.upper() in NOMBRES_MASCULINOS else "femenino"


@transaction.atomic
def ejecutar_seed(periodo="2025-2026", tipo_ingreso="nuevo"):
    usuario = User.objects.first()
    if not usuario:
        raise Exception("Debes crear al menos un usuario administrador primero.")

    ConfiguracionGrado.objects.get_or_create(
        grado_seccion=GRADO,
        defaults={"cupos_maximos": 45},
    )

    creados = 0
    omitidos = 0

    for idx, (nombre, apellido, rep_nombre, rep_apellido, cedula_raw, telefono, correo) in enumerate(ALUMNOS, start=1):
        cedula = _limpiar_cedula(cedula_raw)

        representante, _ = Representante.objects.get_or_create(
            cedula=cedula,
            defaults={
                "nombre":    rep_nombre.title(),
                "apellido":  rep_apellido.title(),
                "telefono":  telefono,
                "correo":    correo.strip().lower(),
                "direccion": "",
            },
        )

        cedula_escolar = f"1ANO-{idx:03d}"
        if Alumno.todos.filter(cedula_escolar=cedula_escolar).exists():
            print(f"  ⚠ Omitido (ya existe): {nombre} {apellido}")
            omitidos += 1
            continue

        alumno = Alumno.objects.create(
            cedula_escolar=cedula_escolar,
            nombre=nombre.title(),
            apellido=apellido.title(),
            fecha_nacimiento=date(2012, 1, 1),  # placeholder — actualizar con fecha real
            genero=_inferir_genero(nombre),
            grado_seccion=GRADO,
            representante=representante,
            estatus_financiero="solvente",
            dia_limite_pago=5,
            porcentaje_beca=0,
            activo=True,
        )

        try:
            Inscripcion.objects.create(
                alumno=alumno,
                periodo_escolar=periodo,
                grado_seccion=GRADO,
                tipo_ingreso=tipo_ingreso,
                documentos_completos=False,
                usuario_registro=usuario,
            )
        except Exception as e:
            print(f"  ⚠ Inscripción fallida para {nombre} {apellido}: {e}")

        creados += 1
        print(f"  ✔ {alumno.nombre} {alumno.apellido} — rep: {representante.nombre} {representante.apellido}")

    print(f"\n✅ Seed completado: {creados} alumnos creados, {omitidos} omitidos.")
