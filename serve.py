#!/usr/bin/env python3
import http.server
import os
import socketserver
import sys

PORT = 8000


class DevHandler(http.server.SimpleHTTPRequestHandler):

    def end_headers(self):
        for header, value in [('Cache-Control', 'no-cache, no-store, must-revalidate'), ('Pragma', 'no-cache'),
                              ('Expires', '0'), ('Access-Control-Allow-Origin', '*')]:
            self.send_header(header, value)
        super().end_headers()

    def do_GET(self):
        if self.path in ['/', '']:
            self.path = '/index.html'
        super().do_GET()


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    if not os.path.exists('index.html'):
        print("Error: index.html not found")
        sys.exit(1)

    print(f"🌞 Dev Server\n📂 {script_dir}\n🌐 http://localhost:{PORT}\n💡 Ctrl+C to stop\n")

    try:
        with socketserver.TCPServer(("", PORT), DevHandler) as httpd:
            httpd.serve_forever()
    except OSError as e:
        print(f"❌ Port {PORT} {'already in use' if e.errno == 48 else f'error: {e}'}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")


if __name__ == "__main__":
    main()
