"""PyQuake — Basic 3D Earthquake Demo using Ursina
Run: python demo_3d.py

Controls:
- Number keys 1-9: set magnitude (1.0 - 9.0)
- Space: trigger earthquake with current magnitude
- R: randomize scene
- Esc: quit
"""
from ursina import *
from ursina.prefabs.first_person_controller import FirstPersonController
from playsound import playsound
import threading
import random
import math

# --- Configuration ---
DEFAULT_MAG = 5.0
QUAKE_DURATION = 4.0  # seconds
SOUND_FILE = 'sounds/Shaking(EN).mp3'  # optional - ensure file exists

app = Ursina()
window.title = 'PyQuake 3D Demo'
window.borderless = False
window.fullscreen = False
window.color = color.rgb(40, 40, 45)

# Ground
ground = Entity(model='plane', scale=(60,1,60), texture='white_cube', texture_scale=(20,20), color=color.dark_gray)

# Simple city: grid of boxes
buildings = []
num_x = 9
num_z = 5
spacing = 3.4

random.seed(2)
for i in range(num_x):
    for j in range(num_z):
        h = random.uniform(1.5, 8)
        b = Entity(model='cube', color=color.lime.tint(random.uniform(-.2,.2)), scale=(1.6,h,1.6),
                   position=((i-(num_x//2))*spacing, h/2, (j-(num_z//2))*spacing))
        b.original_pos = b.position
        b.shake_offset = Vec3(0,0,0)
        buildings.append(b)

# Camera
camera_entity = FirstPersonController(y=2, speed=8)

# HUD
mag_display = Text(text=f'Magnitude: {DEFAULT_MAG:.1f}', position=(-0.77, 0.43), scale=1.4, background=True)
info = Text(text='Press SPACE to trigger quake • 1-9 to set magnitude • R to randomize', position=(-0.77, 0.38), scale=0.7, background=True)
status = Text(text='', position=(-0.77, 0.34), scale=0.9, background=True)

# Earthquake state
quake_time_left = 0.0
quake_magnitude = DEFAULT_MAG
quake_elapsed = 0.0

# play sound in a thread so we don't block update loop
def play_shake_sound():
    try:
        playsound(SOUND_FILE)
    except Exception as e:
        print('Sound error:', e)

# Simple IPC listener for local triggers
import socket, json, queue
ipc_queue = queue.Queue()

def _ipc_listener(host='127.0.0.1', port=9999):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
    except Exception as e:
        print(f'IPC listener unavailable ({e})')
        return
    sock.settimeout(0.5)
    while True:
        try:
            data, addr = sock.recvfrom(4096)
            payload = json.loads(data.decode('utf-8'))
            ipc_queue.put(payload)
        except socket.timeout:
            continue
        except Exception:
            continue

threading.Thread(target=_ipc_listener, daemon=True).start()

# Trigger earthquake
def trigger_quake(magnitude):
    global quake_time_left, quake_magnitude, quake_elapsed
    quake_magnitude = max(0.0, float(magnitude))
    quake_time_left = QUAKE_DURATION
    quake_elapsed = 0.0
    status.text = f'Quake! M {quake_magnitude:.1f}'
    # play sound if available
    threading.Thread(target=play_shake_sound, daemon=True).start()

# randomize building heights
def randomize_scene():
    for b in buildings:
        h = random.uniform(1.5, 8)
        b.scale_y = h
        b.position = Vec3(b.position.x, h/2, b.position.z)
        b.original_pos = b.position

# update loop
def update():
    global quake_time_left, quake_elapsed
    dt = time.dt

    # process any IPC triggers
    while not ipc_queue.empty():
        try:
            trig = ipc_queue.get_nowait()
            mag = trig.get('magnitude')
            epic = trig.get('epicenter') or None
            ep = None
            if epic and isinstance(epic, (list, tuple)) and len(epic) >= 2:
                ep = (float(epic[0]), 0.0, float(epic[1]))
            if mag:
                trigger_quake(float(mag))
        except Exception:
            break

    if quake_time_left > 0:
        quake_elapsed += dt
        quake_time_left -= dt
        intensity = quake_magnitude / 9.0  # normalize
        # shaking frequency and decay
        freq = 8 + quake_magnitude
        decay = max(0.2, 1.0 - quake_elapsed / QUAKE_DURATION)
        for b in buildings:
            dist = distance(b.position, Vec3(0,0,0))
            damper = 1.0 / (1.0 + 0.2 * dist)
            mag = intensity * 0.6 * damper * decay
            shake = Vec3(math.sin(quake_elapsed * freq + b.position.x) * mag,
                         math.cos(quake_elapsed * (freq*0.8) + b.position.z) * mag * 0.6,
                         math.sin(quake_elapsed * (freq*1.2) + b.position.y) * mag)
            b.position = b.original_pos + shake
            b.rotation_z = math.sin(quake_elapsed * freq) * mag * 8
    else:
        # restore buildings smoothly
        for b in buildings:
            b.position = lerp(b.position, b.original_pos, time.dt * 4)
            b.rotation_z = lerp(b.rotation_z, 0, time.dt * 4)
        if status.text:
            status.text = ''

# Input handler
def input(key):
    global quake_magnitude
    if key == 'space':
        trigger_quake(quake_magnitude)
    elif key == 'r':
        randomize_scene()
    elif key in [str(i) for i in range(1,10)]:
        quake_magnitude = int(key)
        mag_display.text = f'Magnitude: {quake_magnitude:.1f}'
    elif key == 'escape':
        application.quit()

# Start message
print('PyQuake 3D demo started — use WASD/mouse to move. Press SPACE to trigger quake.')

app.run()