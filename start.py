from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
import os
import webbrowser

os.chdir(Path(__file__).resolve().parent)
server = ThreadingHTTPServer(('127.0.0.1', 18765), SimpleHTTPRequestHandler)
url = f'http://127.0.0.1:{server.server_port}/'
print('Карта открывается в браузере: ' + url, flush=True)
print('Оставьте это окно открытым. Чтобы остановить карту, закройте окно.', flush=True)
Timer(0.5, lambda: webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
