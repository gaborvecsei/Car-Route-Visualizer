#!/usr/bin/env python3
"""
Simple development server for Route Sun Exposure Visualizer
"""

import http.server
import os
import socketserver
import sys

PORT = 8000


class DevHandler(http.server.SimpleHTTPRequestHandler):

    def end_headers(self):
        # Disable caching for development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')

        # Basic CORS for development
        self.send_header('Access-Control-Allow-Origin', '*')

        super().end_headers()

    def do_GET(self):
        # Serve index.html for root path
        if self.path == '/' or self.path == '':
            self.path = '/index.html'

        super().do_GET()


def main():
    # Change to the directory containing this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    # Check if index.html exists
    if not os.path.exists('index.html'):
        print("Error: index.html not found in current directory")
        sys.exit(1)

    print("🌞 Route Sun Exposure Visualizer - Dev Server")
    print(f"📂 Serving: {script_dir}")
    print(f"🌐 URL: http://localhost:{PORT}")
    print("💡 Press Ctrl+C to stop\n")

    try:
        with socketserver.TCPServer(("", PORT), DevHandler) as httpd:
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 48:    # Address already in use
            print(f"❌ Port {PORT} is already in use")
        else:
            print(f"❌ Server error: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")


if __name__ == "__main__":
    main()
