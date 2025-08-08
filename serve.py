#!/usr/bin/env python3
"""
Production-ready development server for Route Sun Exposure Visualizer
Includes compression, security headers, and proper MIME types
"""

import gzip
import http.server
import io
import mimetypes
import os
import socketserver
import sys
import webbrowser
from urllib.parse import unquote

PORT = 8000

# Configure MIME types
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('application/manifest+json', '.webmanifest')
mimetypes.add_type('image/svg+xml', '.svg')


class CustomHandler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        # Enable compression for these types
        self.compressible_types = {
            'text/html', 'text/css', 'application/javascript', 'application/json', 'text/plain', 'application/xml',
            'application/manifest+json', 'image/svg+xml'
        }
        super().__init__(*args, **kwargs)

    def end_headers(self):
        # Security headers
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-XSS-Protection', '1; mode=block')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')

        # CORS headers for development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

        # Cache control
        path = self.path.lower()
        if path.endswith(('.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2')):
            self.send_header('Cache-Control', 'public, max-age=31536000')    # 1 year
        elif path.endswith('.html'):
            self.send_header('Cache-Control', 'public, max-age=3600')    # 1 hour
        elif path.endswith('sw.js'):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')

        super().end_headers()

    def do_GET(self):
        # Handle service worker at root
        if self.path == '/sw.js':
            self.path = '/sw.js'
        elif self.path == '/' or self.path == '':
            self.path = '/index.html'

        # Get file path and check if it exists
        file_path = self.translate_path(self.path)

        # If file doesn't exist and it's not a special file, serve index.html (SPA behavior)
        if not os.path.exists(file_path) and not self.path.startswith('/privacy'):
            self.path = '/index.html'
            file_path = self.translate_path(self.path)

        # Check if compression is supported by client
        accept_encoding = self.headers.get('Accept-Encoding', '')
        can_gzip = 'gzip' in accept_encoding

        try:
            with open(file_path, 'rb') as f:
                content = f.read()

            # Get content type
            content_type = self.guess_type(file_path)

            # Compress if applicable
            if can_gzip and content_type in self.compressible_types and len(content) > 1024:
                # Compress content
                buf = io.BytesIO()
                with gzip.GzipFile(fileobj=buf, mode='wb') as gz_file:
                    gz_file.write(content)
                content = buf.getvalue()

                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(content)))
                self.send_header('Content-Encoding', 'gzip')
                self.end_headers()
                self.wfile.write(content)
            else:
                # Serve uncompressed
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)

        except FileNotFoundError:
            self.send_error(404, "File not found")
        except Exception as e:
            print(f"Error serving {self.path}: {e}")
            self.send_error(500, "Internal server error")

    def log_message(self, format, *args):
        # Enhanced logging
        print(f"[{self.address_string()}] {format % args}")


def main():
    # Change to the directory containing this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    # Check if required files exist
    required_files = ['index.html', 'styles.css', 'script.js', 'config.js']
    missing_files = [f for f in required_files if not os.path.exists(f)]

    if missing_files:
        print(f"Error: Missing required files: {', '.join(missing_files)}")
        print(f"Make sure you're running this from the project directory: {script_dir}")
        sys.exit(1)

    print("🌞 Route Sun Exposure Visualizer - Development Server")
    print("=" * 55)
    print(f"📂 Serving from: {script_dir}")
    print(f"🌐 Server URL: http://localhost:{PORT}")
    print(f"📱 Application: http://localhost:{PORT}/index.html")
    print(f"🔒 Privacy Policy: http://localhost:{PORT}/privacy.html")
    print("=" * 55)
    print("Features enabled:")
    print("  ✅ Gzip compression")
    print("  ✅ Security headers")
    print("  ✅ Proper MIME types")
    print("  ✅ Cache control")
    print("  ✅ SPA routing")
    print("\n💡 Press Ctrl+C to stop the server")
    print("💡 The app will auto-open in your browser...\n")

    try:
        with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
            # Auto-open the application in browser
            webbrowser.open(f'http://localhost:{PORT}/index.html')

            httpd.serve_forever()
    except OSError as e:
        if e.errno == 48:    # Address already in use
            print(f"❌ Port {PORT} is already in use. Try a different port or stop the existing server.")
        else:
            print(f"❌ Server error: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped. Thanks for using Route Sun Exposure Visualizer!")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        sys.exit(1)
