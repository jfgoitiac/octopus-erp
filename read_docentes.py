import pandas as pd

file_path = r"C:\Users\PC\Downloads\Base de Datos Colegio\DATOS DEL PERSONAL DOCENTE.xlsx"

try:
    xls = pd.ExcelFile(file_path)
    print("=== HOJAS DISPONIBLES ===")
    print(xls.sheet_names)

    df = pd.read_excel(file_path, sheet_name=0)

    print("\n=== ESTRUCTURA DE DATOS ===")
    print(f"Dimensiones: {df.shape}")
    print(f"\nColumnas:")
    for i, col in enumerate(df.columns):
        print(f"  {i}: {col}")

    print(f"\nPrimeras filas:")
    print(df.head(10))

    print(f"\nDatos faltantes:")
    print(df.isnull().sum())

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
