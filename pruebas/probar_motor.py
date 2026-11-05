"""Pruebas de seguridad y validación del motor local (debe estar iniciado).

Uso:  .venv-motor\\Scripts\\python.exe pruebas\\probar_motor.py
"""
import base64
import http.client
import io
import json
import socket
import subprocess
import sys
from pathlib import Path

from PIL import Image

PUERTO = 8765
fallos = 0


def ok(cond, msg):
    global fallos
    print(("  OK    " if cond else "  FALLA ") + msg)
    if not cond:
        fallos += 1


def pedir(metodo, ruta, cuerpo=None, cabeceras=None, host="127.0.0.1"):
    c = http.client.HTTPConnection(host, PUERTO, timeout=60)
    h = {"Host": f"127.0.0.1:{PUERTO}", "Origin": "null"}
    h.update(cabeceras or {})
    h = {k: v for k, v in h.items() if v is not None}
    datos = json.dumps(cuerpo).encode() if isinstance(cuerpo, (dict, list)) else cuerpo
    if datos is not None and "Content-Type" not in h:
        h["Content-Type"] = "application/json"
    c.request(metodo, ruta, body=datos, headers=h)
    r = c.getresponse()
    txt = r.read()
    try:
        j = json.loads(txt)
    except ValueError:
        j = {}
    return r.status, dict(r.getheaders()), j


def png(im):
    b = io.BytesIO()
    im.save(b, "PNG")
    return base64.b64encode(b.getvalue()).decode()


print("\nOrígenes y acceso")
s, h, j = pedir("GET", "/estado")
ok(s == 200 and h.get("Access-Control-Allow-Origin") == "null", f"el editor abierto con doble clic (origen null) es aceptado: {j}")
s, h, _ = pedir("GET", "/estado", cabeceras={"Origin": "https://sitio-ajeno.example"})
ok(s == 403 and "Access-Control-Allow-Origin" not in h, f"una página web ajena es rechazada ({s}, sin cabecera CORS)")
s, h, _ = pedir("OPTIONS", "/rellenar", cabeceras={"Origin": "https://sitio-ajeno.example", "Access-Control-Request-Method": "POST"})
ok(s == 403, f"la verificación previa (preflight) de un origen ajeno es rechazada ({s})")
s, h, _ = pedir("GET", "/estado", cabeceras={"Host": "atacante.example:8765"})
ok(s == 403, f"cabecera Host ajena (DNS rebinding) rechazada ({s})")
s, _, _ = pedir("GET", "/estado", cabeceras={"Origin": None})
ok(s == 200, f"herramientas locales sin Origin (curl en este equipo) aceptadas ({s})")

ips = {a[4][0] for a in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)} - {"127.0.0.1"}
for ip in sorted(ips):
    try:
        socket.create_connection((ip, PUERTO), timeout=2).close()
        ok(False, f"accesible desde la red en {ip}:{PUERTO}")
    except OSError:
        ok(True, f"no accesible desde la red por {ip}:{PUERTO} (conexión rechazada)")
out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True).stdout
esc = [l.split()[1] for l in out.splitlines() if f":{PUERTO} " in l and "LISTENING" in l]
ok(esc and all(e.startswith("127.0.0.1:") for e in esc), f"escucha solo en {esc}")

print("\nValidación de archivos")
base = Image.new("RGB", (40, 30), (240, 240, 240))
mask = Image.new("L", (40, 30), 0)
mask.paste(255, (10, 10, 20, 20))
s, _, j = pedir("POST", "/rellenar", b"imagen=hola", cabeceras={"Content-Type": "application/x-www-form-urlencoded"})
ok(s == 415, f"cuerpo que no es JSON: {s} {j.get('error')}")
s, _, j = pedir("POST", "/rellenar", b"{no es json", cabeceras={"Content-Type": "application/json"})
ok(s == 400, f"JSON roto: {s} {j.get('error')}")
s, _, j = pedir("POST", "/rellenar", {"imagen": "%%%nobase64", "mascara": png(mask)})
ok(s == 400, f"base64 inválido: {s} {j.get('error')}")
s, _, j = pedir("POST", "/rellenar", {"imagen": base64.b64encode(b"MZ\x90\x00 ejecutable de mentira").decode(), "mascara": png(mask)})
ok(s == 415, f"archivo que no es imagen (firma de .exe): {s} {j.get('error')}")
s, _, j = pedir("POST", "/rellenar", {"imagen": base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00basura" * 50).decode(), "mascara": png(mask)})
ok(s == 400, f"PNG dañado: {s} {j.get('error')}")
s, _, j = pedir("POST", "/rellenar", {"imagen": png(Image.new("L", (13000, 1))), "mascara": png(mask)})
ok(s == 413, f"dimensiones excesivas (13000×1): {s} {j.get('error')}")
s, _, j = pedir("POST", "/rellenar", {"imagen": png(base), "mascara": png(Image.new("L", (10, 10)))})
ok(s == 400, f"máscara de otro tamaño: {s} {j.get('error')}")
c = http.client.HTTPConnection("127.0.0.1", PUERTO, timeout=10)
c.putrequest("POST", "/rellenar", skip_host=True)
for k, v in {"Host": f"127.0.0.1:{PUERTO}", "Origin": "null", "Content-Type": "application/json", "Content-Length": str(200 * 1024 * 1024)}.items():
    c.putheader(k, v)
c.endheaders()
r = c.getresponse()
ok(r.status == 413, f"petición de 200 MB rechazada sin leerla: {r.status}")
s, _, j = pedir("POST", "/descargar-modelo", {})
ok(s == 400, f"descargar el modelo sin confirmación: {s} {j.get('error')}")
s, _, j = pedir("POST", "/no-existe", {})
ok(s == 404, f"ruta inexistente: {s}")

print("\nTrabajo válido")
d = Image.new("RGB", (40, 30), (240, 240, 240))
d.paste((0, 0, 0), (12, 12, 18, 18))
s, _, j = pedir("POST", "/rellenar", {"imagen": png(d), "mascara": png(mask), "metodo": "telea", "radio": 3})
res = Image.open(io.BytesIO(base64.b64decode(j.get("imagen", "")))) if s == 200 else None
ok(s == 200 and res.size == (40, 30) and res.getpixel((15, 15))[:3] == (240, 240, 240), f"cv2.inpaint rellena la zona: {s}, píxel central {res and res.getpixel((15, 15))}")

print("\nGuardia de red dentro del motor (proceso aparte)")
codigo = (
    "import sys; sys.path.insert(0, r'%s'); import motor, socket\n"
    "s = socket.socket()\n"
    "try:\n s.settimeout(3); s.connect(('93.184.216.34', 80)); print('SALE')\n"
    "except OSError as e: print('BLOQUEADA', e)\n"
    "try:\n socket.getaddrinfo('pypi.org', 443); print('SALE')\n"
    "except OSError as e: print('BLOQUEADA', e)\n"
    "import urllib.request\n"
    "try:\n urllib.request.urlopen('https://github.com/', timeout=5); print('SALE')\n"
    "except OSError as e: print('BLOQUEADA', type(e).__name__)\n" % str(Path(__file__).resolve().parent.parent)
)
r = subprocess.run([sys.executable, "-c", codigo], capture_output=True, text=True, encoding="utf-8", env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"})
ok(r.stdout.count("BLOQUEADA") == 3 and "SALE" not in r.stdout, "conexión directa, búsqueda DNS y HTTPS bloqueadas: " + r.stdout.strip().replace("\n", " | ") + r.stderr[-300:])

print("\n" + ("Todo correcto" if not fallos else f"{fallos} comprobación(es) fallida(s)"))
sys.exit(1 if fallos else 0)
