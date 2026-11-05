# EditorVentana

Editor de prototipos de ventanas (Mesa de Calco) con un motor local opcional para
quitar fondos (rembg) y rellenar zonas (OpenCV). Todo funciona en tu equipo: el motor
solo escucha en `127.0.0.1` y no envía imágenes a internet.

**Autor:** DanielMarroquin

## Descargar (portable para Windows)

1. Ve a [**Releases**](../../releases/latest) y descarga `EditorVentana-portable.zip`.
2. Descomprímelo donde quieras (Escritorio, USB…).
3. Doble clic en `EditorVentana.exe`: se abre la ventana del motor y el editor en tu navegador.

No necesita instalar Python. El modelo para quitar fondos ya viene incluido.
Si Windows SmartScreen avisa, pulsa *Más información → Ejecutar de todas formas*.

## Usar desde el código

- Solo el editor: abre `editor-prototipos.html` con doble clic.
- Con el motor: ejecuta `iniciar_motor.bat` (la primera vez instala las dependencias de `requirements.txt`).

## Crear el portable

```powershell
powershell -ExecutionPolicy Bypass -File empaquetar\construir.ps1
```

Genera `dist\EditorVentana\` y `dist\EditorVentana-portable.zip`.
