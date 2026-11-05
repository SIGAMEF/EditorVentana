# EditorVentana

Editor de prototipos de ventanas (Mesa de Calco) con un motor local opcional para
quitar fondos (rembg) y rellenar zonas (OpenCV). Todo funciona en tu equipo: el motor
solo escucha en `127.0.0.1` y no envía imágenes a internet.

**Autor:** DanielMarroquin

## Qué puedes hacer

- **Detectar formulario**: reconoce cajas, listas, casillas, botones, textos, líneas y paneles
  de la captura. Cada texto conserva su aspecto original y se quita de la captura, así puedes
  moverlo o escribir otro encima. Las opciones están en el panel derecho (sin nada elegido).
- **Mejorar letras**: más contraste, negrita y tinta más oscura para los textos detectados
  (se puede quitar) y, si quieres, para el texto que siga en la captura.
- **Copiar y pegar**: elige una zona de la captura y pégala donde hagas clic, como un recorte
  que puedes mover, estirar (Shift mantiene la proporción) y decorar con marco y sombra.
- **Borrar y rellenar**: cubre toda la zona con el color del fondo que la rodea.
- **Flechas curvas**: arrastra el punto del medio para curvarlas sin mover el origen ni la punta.
- **Ver grilla**: líneas guía con tamaño, color y opacidad; no se seleccionan ni se exportan.
- **Copiar imagen** con o sin marco (rectángulo o esquinas curvas, color, línea continua,
  guiones, puntos o doble, grosor, margen y sombra).

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
