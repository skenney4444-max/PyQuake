#!/usr/bin/env python3
"""Simple gallery server for PyQuake screenshots/GIFs.

Run: python gallery.py
Visit: http://127.0.0.1:5000/

Endpoints:
- GET /        -> gallery HTML listing files in 'public/' and 'screenshots/'
- POST /register -> JSON { "path": "/abs/path/to/gif" } to register a GIF (copied into public/)
- GET /public/<path:filename> -> serves files from public/
"""
from flask import Flask, send_from_directory, request, jsonify, render_template_string
import os, shutil, datetime

PUBLIC_DIR = os.path.join(os.path.dirname(__file__), 'public')
SCREEN_DIR = os.path.join(os.path.dirname(__file__), 'screenshots')
os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(SCREEN_DIR, exist_ok=True)

app = Flask(__name__)

GALLERY_HTML = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>PyQuake Gallery</title>
  <style>
    body { background:#0d0f12; color:#eee; font-family:system-ui, sans-serif; padding:24px }
    .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px,1fr)); gap:16px }
    .card { background:#111; border-radius:8px; padding:8px }
    img { max-width:100%; border-radius:6px }
    a { color:#9cc; text-decoration:none }
  </style>
</head>
<body>
  <h1>PyQuake Gallery</h1>
  <p>Public directory: <code>{{public_dir}}</code></p>
  <div class="grid">
  {% for f in files %}
    <div class="card">
      <a href="/public/{{f}}"><img src="/public/{{f}}"/></a>
      <div><small>{{f}}</small></div>
    </div>
  {% endfor %}
  </div>
  <hr/>
  <h3>Register</h3>
  <p>POST JSON {"path": "/abs/path/to/gif"} to <code>/register</code> to copy a GIF into the public gallery.</p>
</body>
</html>
"""

@app.route('/')
def index():
    files = [f for f in os.listdir(PUBLIC_DIR) if os.path.isfile(os.path.join(PUBLIC_DIR, f))]
    files.sort(key=lambda x: os.path.getmtime(os.path.join(PUBLIC_DIR, x)), reverse=True)
    return render_template_string(GALLERY_HTML, files=files, public_dir=PUBLIC_DIR)

@app.route('/public/<path:filename>')
def public_file(filename):
    return send_from_directory(PUBLIC_DIR, filename)

@app.route('/register', methods=['POST'])
def register():
    try:
        data = request.get_json(force=True)
        path = data.get('path')
        if not path:
            return jsonify({'ok': False, 'error': 'missing path'}), 400
        if not os.path.exists(path):
            return jsonify({'ok': False, 'error': 'file not found', 'path': path}), 404
        fname = os.path.basename(path)
        # ensure unique filename
        dest = os.path.join(PUBLIC_DIR, fname)
        if os.path.exists(dest):
            base, ext = os.path.splitext(fname)
            ts = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
            dest = os.path.join(PUBLIC_DIR, f"{base}_{ts}{ext}")
        shutil.copy2(path, dest)
        return jsonify({'ok': True, 'dest': dest})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print('Starting PyQuake gallery on http://127.0.0.1:5000')
    app.run(host='127.0.0.1', port=5000)
