"""
Script de un solo uso: autoriza con tu cuenta de Gmail el acceso de
'Octopus Backups' a Drive y genera token.json para subir al VPS.

Uso:
    python autorizar_drive.py client_secret_XXXX.json

Corre esto en tu PC (con navegador), NUNCA en el VPS.
"""
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ['https://www.googleapis.com/auth/drive.file']


def main():
    if len(sys.argv) != 2:
        print("Uso: python autorizar_drive.py client_secret_XXXX.json")
        sys.exit(1)

    client_secret_file = sys.argv[1]
    flow = InstalledAppFlow.from_client_secrets_file(client_secret_file, SCOPES)
    credenciales = flow.run_local_server(port=0)

    with open('token.json', 'w', encoding='utf-8') as f:
        f.write(credenciales.to_json())

    print("\nListo. Se generó token.json en esta misma carpeta.")
    print("Súbelo al VPS en /etc/octopus/google-drive-token.json")


if __name__ == '__main__':
    main()
