#!/usr/bin/env python3
import http.server
import os
import socketserver
import sys
import webbrowser

PORT = 8000


class CustomHandler(http.server.SimpleHTTPRequestHandler):

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()


def main():
    # Change to the directory containing this script
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
        print(f"Server running at http://localhost:{PORT}")
        print(f"Multi Maps Route Visualizer: http://localhost:{PORT}/index.html")
        print("Press Ctrl+C to stop the server")

        # Auto-open the application in browser
        webbrowser.open(f'http://localhost:{PORT}/index.html')

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == "__main__":
    main()
