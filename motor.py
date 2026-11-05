"""Motor local opcional de Mesa de Calco.

Hace solo lo que el navegador no resuelve bien:
  * POST /quitar-fondo   -> máscara de rembg (fotos)
  * POST /rellenar       -> cv2.inpaint (Telea o Navier-Stokes) para zonas complejas
  * POST /descargar-modelo -> descarga UNA vez el modelo de rembg (pide confirmación)
  * GET  /estado         -> qué está disponible

Seguridad:
  * Escucha solo en 127.0.0.1: no es accesible desde otros equipos.
  * Solo acepta peticiones del editor abierto con doble clic (origen «null», file://)
    o del propio 127.0.0.1/localhost en este puerto; rechaza cualquier otro origen
    y cualquier cabecera Host distinta (protege contra «DNS rebinding»).
  * Bloquea toda conexión saliente que no sea al propio equipo. La única excepción
    es la descarga del modelo, que solo ocurre cuando tú la confirmas.
  * Valida tipo (firma PNG/JPEG/WebP), tamaño del archivo y dimensiones de cada imagen.
  * No guarda las imágenes en disco ni las escribe en el registro.

Uso:  python motor.py                   (inicia el motor)
      python motor.py --descargar-modelo (descarga el modelo, con confirmación)
"""
from __future__ import annotations

import base64
import binascii
import importlib.util
import io
import ipaddress
import json
import os
import socket
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "1.1.0"
CONGELADO = getattr(sys, "frozen", False)  # True dentro del ejecutable portable (PyInstaller)
AQUI = Path(sys.executable).resolve().parent if CONGELADO else Path(__file__).resolve().parent
HOST = "127.0.0.1"
PUERTO = int(os.environ.get("MESA_MOTOR_PUERTO", "8765"))
MAX_CUERPO = 48 * 1024 * 1024      # petición JSON completa (las imágenes van en base64)
MAX_ARCHIVO = 25 * 1024 * 1024     # cada imagen ya decodificada
MAX_PIXELES = 40_000_000
MAX_LADO = 12_000
MODELO = os.environ.get("MESA_MOTOR_MODELO", "u2net")
MODELO_MB = {"u2net": 176, "u2netp": 5, "u2net_human_seg": 176, "isnet-general-use": 179, "silueta": 43}
os.environ.setdefault("U2NET_HOME", str(AQUI / "modelos"))

ORIGENES = {"null", f"http://127.0.0.1:{PUERTO}", f"http://localhost:{PUERTO}"}
HOSTS = {f"127.0.0.1:{PUERTO}", f"localhost:{PUERTO}"}

for _flujo in (sys.stdout, sys.stderr):
    try:
        _flujo.reconfigure(errors="replace", **({} if _flujo.isatty() else {"encoding": "utf-8"}))
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Guardia de red: nada sale del equipo salvo la descarga confirmada del modelo
# ---------------------------------------------------------------------------
_descarga_permitida = threading.Event()


def _es_local(host) -> bool:
    if host is None:
        return True
    host = str(host).split("%")[0]
    if host in ("localhost", ""):
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _vigilar(direccion):
    if _descarga_permitida.is_set():
        return
    host = direccion[0] if isinstance(direccion, tuple) else None
    if not _es_local(host):
        raise ConnectionRefusedError(f"Mesa de Calco: conexión externa bloqueada ({host}).")


_connect, _connect_ex, _getaddrinfo = socket.socket.connect, socket.socket.connect_ex, socket.getaddrinfo


def _connect_vigilado(self, direccion):
    _vigilar(direccion)
    return _connect(self, direccion)


def _connect_ex_vigilado(self, direccion):
    _vigilar(direccion)
    return _connect_ex(self, direccion)


def _getaddrinfo_vigilado(host, *args, **kwargs):
    if not _descarga_permitida.is_set() and not _es_local(host.decode() if isinstance(host, bytes) else host):
        raise socket.gaierror(f"Mesa de Calco: búsqueda de «{host}» bloqueada (sin conexiones externas).")
    return _getaddrinfo(host, *args, **kwargs)


socket.socket.connect = _connect_vigilado
socket.socket.connect_ex = _connect_ex_vigilado
socket.getaddrinfo = _getaddrinfo_vigilado


# ---------------------------------------------------------------------------
# Capacidades
# ---------------------------------------------------------------------------
class ErrorCliente(Exception):
    def __init__(self, codigo: int, mensaje: str):
        super().__init__(mensaje)
        self.codigo = codigo


_sesion = None
_bloqueo_modelo = threading.Lock()
_bloqueo_trabajo = threading.Semaphore(1)  # un trabajo pesado a la vez


def ruta_modelo() -> Path:
    """Dónde está (o estará) el modelo: rembg reciente usa modelos/models/<nombre>/, las versiones antiguas modelos/."""
    base = Path(os.environ["U2NET_HOME"])
    nueva, antigua = base / "models" / MODELO / f"{MODELO}.onnx", base / f"{MODELO}.onnx"
    return antigua if antigua.is_file() and not nueva.is_file() else nueva


def hay_modulo(nombre: str) -> bool:
    try:
        return importlib.util.find_spec(nombre) is not None
    except (ImportError, ValueError):
        return False


def estado_rembg() -> str:
    if not hay_modulo("rembg"):
        return "no_instalado"
    return "listo" if ruta_modelo().is_file() else "sin_modelo"


def sesion_rembg():
    """Carga el modelo ya descargado. Si faltara, NO lo descarga: la guardia de red lo impediría."""
    global _sesion
    with _bloqueo_modelo:
        if _sesion is None:
            if estado_rembg() != "listo":
                raise ErrorCliente(409, "Falta el modelo de rembg. Descárgalo primero desde el editor.")
            from rembg import new_session
            _sesion = new_session(MODELO)
        return _sesion


def descargar_modelo() -> None:
    global _sesion
    if not hay_modulo("rembg"):
        raise ErrorCliente(409, "rembg no está instalado. Ejecuta iniciar_motor.bat de nuevo.")
    with _bloqueo_modelo:
        if ruta_modelo().is_file() and _sesion is not None:
            return
        Path(os.environ["U2NET_HOME"]).mkdir(parents=True, exist_ok=True)
        print(f"  Descargando el modelo «{MODELO}» (~{MODELO_MB.get(MODELO, '?')} MB). Es la única conexión externa del motor…", flush=True)
        _descarga_permitida.set()
        try:
            from rembg import new_session
            _sesion = new_session(MODELO)
        finally:
            _descarga_permitida.clear()
        print("  Modelo listo. A partir de ahora el motor no vuelve a conectarse a internet.", flush=True)


# ---------------------------------------------------------------------------
# Validación de imágenes
# ---------------------------------------------------------------------------
def tipo_por_firma(datos: bytes):
    if datos.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if datos.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if len(datos) >= 12 and datos[:4] == b"RIFF" and datos[8:12] == b"WEBP":
        return "WEBP"
    return None


def leer_imagen(valor, nombre: str):
    from PIL import Image
    if not isinstance(valor, str) or not valor:
        raise ErrorCliente(400, f"Falta «{nombre}» (imagen en base64).")
    if len(valor) > MAX_ARCHIVO * 4 // 3 + 16:
        raise ErrorCliente(413, f"«{nombre}» supera {MAX_ARCHIVO // (1024 * 1024)} MB.")
    try:
        datos = base64.b64decode(valor, validate=True)
    except (binascii.Error, ValueError):
        raise ErrorCliente(400, f"«{nombre}» no es base64 válido.")
    if len(datos) > MAX_ARCHIVO:
        raise ErrorCliente(413, f"«{nombre}» supera {MAX_ARCHIVO // (1024 * 1024)} MB.")
    tipo = tipo_por_firma(datos)
    if not tipo:
        raise ErrorCliente(415, f"«{nombre}» no es una imagen PNG, JPEG o WebP.")
    Image.MAX_IMAGE_PIXELS = MAX_PIXELES
    try:
        with Image.open(io.BytesIO(datos)) as prueba:
            if prueba.format != tipo:
                raise ErrorCliente(415, f"«{nombre}»: el contenido no coincide con su tipo.")
            w, h = prueba.size
            if w < 1 or h < 1 or w > MAX_LADO or h > MAX_LADO or w * h > MAX_PIXELES:
                raise ErrorCliente(413, f"«{nombre}» mide {w}×{h}: el máximo es {MAX_LADO} px por lado y {MAX_PIXELES // 1_000_000} megapíxeles.")
            prueba.verify()
        imagen = Image.open(io.BytesIO(datos))
        imagen.load()
        return imagen
    except ErrorCliente:
        raise
    except Image.DecompressionBombError:
        raise ErrorCliente(413, f"«{nombre}» es demasiado grande.")
    except Exception:
        raise ErrorCliente(400, f"«{nombre}» está dañada o no es una imagen válida.")


def a_base64_png(imagen) -> str:
    buf = io.BytesIO()
    imagen.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


# ---------------------------------------------------------------------------
# Trabajos
# ---------------------------------------------------------------------------
def quitar_fondo(cuerpo: dict) -> dict:
    imagen = leer_imagen(cuerpo.get("imagen"), "imagen")
    sesion = sesion_rembg()
    from rembg import remove
    with _bloqueo_trabajo:
        mascara = remove(imagen.convert("RGB"), session=sesion, only_mask=True)
    mascara = mascara.convert("L")
    if mascara.size != imagen.size:
        mascara = mascara.resize(imagen.size)
    return {"mascara": a_base64_png(mascara)}


def rellenar(cuerpo: dict) -> dict:
    if not hay_modulo("cv2"):
        raise ErrorCliente(409, "OpenCV no está instalado. Ejecuta iniciar_motor.bat de nuevo.")
    import cv2
    import numpy as np
    from PIL import Image
    imagen = leer_imagen(cuerpo.get("imagen"), "imagen").convert("RGBA")
    mascara = leer_imagen(cuerpo.get("mascara"), "mascara").convert("L")
    if mascara.size != imagen.size:
        raise ErrorCliente(400, "La máscara debe medir lo mismo que la imagen.")
    metodo = cuerpo.get("metodo", "telea")
    if metodo not in ("telea", "ns"):
        raise ErrorCliente(400, "«metodo» debe ser «telea» o «ns».")
    try:
        radio = int(cuerpo.get("radio", 3))
    except (TypeError, ValueError):
        raise ErrorCliente(400, "«radio» debe ser un número entero.")
    radio = max(1, min(25, radio))
    rgba = np.asarray(imagen)
    m = (np.asarray(mascara) > 127).astype(np.uint8) * 255
    if not m.any():
        raise ErrorCliente(400, "La máscara está vacía.")
    bgr = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2BGR)
    with _bloqueo_trabajo:
        res = cv2.inpaint(bgr, m, radio, cv2.INPAINT_TELEA if metodo == "telea" else cv2.INPAINT_NS)
    salida = np.dstack([cv2.cvtColor(res, cv2.COLOR_BGR2RGB), rgba[:, :, 3]])
    return {"imagen": a_base64_png(Image.fromarray(salida, "RGBA"))}


def estado() -> dict:
    return {
        "app": "mesa-de-calco-motor",
        "version": VERSION,
        "rembg": estado_rembg(),
        "opencv": hay_modulo("cv2"),
        "modelo": MODELO,
        "modelo_mb": MODELO_MB.get(MODELO, 170),
        "maximo_mb": MAX_ARCHIVO // (1024 * 1024),
    }


RUTAS_POST = {
    "/quitar-fondo": quitar_fondo,
    "/rellenar": rellenar,
    "/descargar-modelo": lambda c: (_confirmada(c), descargar_modelo(), {"ok": True, "rembg": estado_rembg()})[-1],
}


def _confirmada(cuerpo: dict):
    if cuerpo.get("confirmar") is not True:
        raise ErrorCliente(400, "La descarga del modelo necesita confirmación.")


# ---------------------------------------------------------------------------
# Servidor HTTP
# ---------------------------------------------------------------------------
class Manejador(BaseHTTPRequestHandler):
    server_version = "MesaDeCalcoMotor/" + VERSION
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def _permitido(self):
        if self.headers.get("Host", "") not in HOSTS:
            return False, None
        origen = self.headers.get("Origin")
        if origen is not None and origen not in ORIGENES:
            return False, None
        return True, origen

    def _cabeceras_comunes(self, origen):
        if origen:
            self.send_header("Access-Control-Allow-Origin", origen)
            self.send_header("Vary", "Origin")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")

    def _responder(self, codigo: int, obj: dict, origen=None, cerrar=False):
        datos = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self._cabeceras_comunes(origen)
        if cerrar:
            self.send_header("Connection", "close")
            self.close_connection = True
        self.end_headers()
        self.wfile.write(datos)

    def _rechazar(self):
        self._responder(403, {"error": "Origen no permitido. El motor solo atiende al editor en este equipo."}, cerrar=True)

    def do_OPTIONS(self):
        ok, origen = self._permitido()
        if not ok or (self.path not in RUTAS_POST and self.path != "/estado"):
            return self._rechazar()
        self.send_response(204)
        self._cabeceras_comunes(origen)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        ok, origen = self._permitido()
        if not ok:
            return self._rechazar()
        if self.path != "/estado":
            return self._responder(404, {"error": "No existe."}, origen)
        self._responder(200, estado(), origen)

    def do_POST(self):
        ok, origen = self._permitido()
        if not ok:
            return self._rechazar()
        trabajo = RUTAS_POST.get(self.path)
        if not trabajo:
            return self._responder(404, {"error": "No existe."}, origen, cerrar=True)
        if not self.headers.get("Content-Type", "").lower().startswith("application/json"):
            return self._responder(415, {"error": "Se espera JSON (application/json)."}, origen, cerrar=True)
        try:
            largo = int(self.headers.get("Content-Length", ""))
        except ValueError:
            return self._responder(411, {"error": "Falta Content-Length."}, origen, cerrar=True)
        if largo < 0 or largo > MAX_CUERPO:
            return self._responder(413, {"error": f"La petición supera {MAX_CUERPO // (1024 * 1024)} MB."}, origen, cerrar=True)
        cuerpo = self.rfile.read(largo)
        try:
            datos = json.loads(cuerpo)
            if not isinstance(datos, dict):
                raise ValueError
        except ValueError:
            return self._responder(400, {"error": "JSON inválido."}, origen)
        inicio = time.time()
        try:
            res = trabajo(datos)
            self._responder(200, res, origen)
            self._nota(f"{self.path} listo en {time.time() - inicio:.1f} s")
        except ErrorCliente as e:
            self._responder(e.codigo, {"error": str(e)}, origen)
            self._nota(f"{self.path} rechazado ({e.codigo}): {e}")
        except Exception as e:  # noqa: BLE001 - se informa sin exponer detalles internos
            traceback.print_exc()
            self._responder(500, {"error": f"Error interno del motor: {type(e).__name__}."}, origen)

    def _nota(self, texto):
        print(f"  [{time.strftime('%H:%M:%S')}] {texto}", flush=True)

    def log_message(self, formato, *args):  # silencioso: sin datos de imágenes en consola
        pass


class Servidor(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def server_bind(self):
        # sin búsqueda de nombre del equipo (getfqdn), y solo en 127.0.0.1
        self.socket.bind(self.server_address)
        self.server_address = self.socket.getsockname()
        self.server_name, self.server_port = HOST, self.server_address[1]


def aviso_modelo():
    est = estado_rembg()
    if est == "sin_modelo":
        print(f"\n  AVISO: «Quitar fondo automático» necesita el modelo «{MODELO}» (~{MODELO_MB.get(MODELO, '?')} MB).")
        print("  No se descarga solo: se bajará UNA vez de internet cuando lo confirmes en el editor")
        print("  (botón «Descargar modelo») o con:  python motor.py --descargar-modelo")
        print("  Es la única conexión externa del motor.")
    elif est == "no_instalado":
        print("\n  AVISO: rembg no está instalado; «Quitar fondo automático» no estará disponible.")
    if not hay_modulo("cv2"):
        print("  AVISO: OpenCV no está instalado; el relleno con cv2.inpaint no estará disponible.")


def main():
    if "--descargar-modelo" in sys.argv:
        if estado_rembg() == "listo":
            print("El modelo ya está descargado en", ruta_modelo())
            return 0
        print(f"Se descargará el modelo «{MODELO}» (~{MODELO_MB.get(MODELO, '?')} MB) desde internet a {ruta_modelo().parent}.")
        print("Es la única conexión externa del motor. Tus imágenes nunca se envían.")
        if input("¿Descargar ahora? (s/n): ").strip().lower() not in ("s", "si", "sí", "y"):
            print("Cancelado.")
            return 1
        descargar_modelo()
        return 0
    try:
        srv = Servidor((HOST, PUERTO), Manejador)
    except OSError as e:
        print(f"No pude abrir el puerto {PUERTO} en {HOST}: {e}")
        print("¿Ya hay otro motor abierto? Ciérralo, o elige otro puerto con la variable MESA_MOTOR_PUERTO.")
        return 1
    print(f"\n  Motor de Mesa de Calco {VERSION} listo en http://{HOST}:{PUERTO}")
    print("  Solo acepta conexiones de este equipo y no envía imágenes a internet.")
    print(f"  rembg: {estado_rembg()}   OpenCV: {'sí' if hay_modulo('cv2') else 'no'}")
    aviso_modelo()
    print("\n  Deja esta ventana abierta mientras uses el editor. Ctrl+C para cerrar.\n", flush=True)
    if "--abrir-editor" in sys.argv or (CONGELADO and "--sin-editor" not in sys.argv):
        editor = AQUI / "editor-prototipos.html"
        try:
            os.startfile(str(editor))  # abre el archivo local en el navegador predeterminado
            print("  Abrí el editor en tu navegador.\n", flush=True)
        except Exception:
            print(f"  Abre el editor con doble clic en: {editor}\n", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
