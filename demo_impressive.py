"""PyQuake — Impressive Earthquake Demo (Preset: M7.8 Megathrust)
Run: python demo_impressive.py

Features:
- Procedural terrain and radial city cluster
- Epicenter + expanding seismic wave visual
- Building damage & collapse, debris simulation
- Camera shake, HUD, and sound
- Preset earthquake: M7.8 megathrust (press 1 to trigger), press SPACE to trigger current

Controls:
- 1: Trigger preset M7.8 megathrust (epicenter in ocean, strong shaking)
- 2: Trigger M6.2 shallow urban quake (epicenter on city)
- SPACE: trigger current magnitude
- R: reset scene
- ESC: quit
"""
import sys
import argparse
import random
import math
import threading
from playsound import playsound

# CLI pre-parse to allow headless execution without importing Ursina
_cli = argparse.ArgumentParser(add_help=False)
_cli.add_argument('--headless', action='store_true', help='run a headless export (no OpenGL window)')
_cli.add_argument('--magnitude', '-m', type=float, help='trigger quake on start (magnitude)')
_cli.add_argument('--epicenter', '-e', type=str, help='epicenter as x,z (comma separated)')
_cli_args, _unknown = _cli.parse_known_args()
HEADLESS_MODE = bool(_cli_args.headless)
STARTUP_MAGNITUDE = _cli_args.magnitude
STARTUP_EPICENTER = None
if _cli_args.epicenter:
    try:
        parts = [p.strip() for p in _cli_args.epicenter.replace(';',',').split(',') if p.strip()]
        if len(parts) >= 2:
            STARTUP_EPICENTER = (float(parts[0]), 0.0, float(parts[1]))
    except Exception:
        STARTUP_EPICENTER = None

# If headless, import minimal imaging libs only and define a headless runner immediately
if HEADLESS_MODE:
    from PIL import Image, ImageDraw
    import os, time
    try:
        import imageio
    except Exception:
        imageio = None

    # --------- headless renderer -------------------------------------------------
    def _headless_simulate(magnitude=7.8, epicenter=(0.0, 0.0), duration=6.0, fps=20, outdir='screenshots'):
        """Run a simplified simulation and render 2D frames to a GIF (no OpenGL needed)."""
        print(f'Headless simulate: M={magnitude}, epicenter={epicenter}, duration={duration}s, fps={fps}')
        os.makedirs(outdir, exist_ok=True)
        width, height = 960, 540
        scale = 18.0  # world units -> pixels scaling (approx)

        # Procedural city: adopt similar layout as interactive demo
        random.seed(42)
        buildings = []
        CITY_RADIUS = 9.0
        for i in range(100):
            r = random.uniform(1.8, CITY_RADIUS)
            ang = random.uniform(0, math.tau)
            x = math.cos(ang) * r
            z = math.sin(ang) * r
            height_b = random.uniform(2.0, 18.0) * (1.0 - (r/CITY_RADIUS)*0.85)
            buildings.append({'x': x, 'z': z, 'height': height_b, 'orig_y': height_b/2.0, 'collapsed': False, 'health': 1.0})

        rings = []
        debris = []

        frames = []
        total_frames = max(1, int(duration * fps))

        for frame in range(total_frames):
            t = frame / fps
            elapsed = t
            # wave travel
            travel = elapsed * 6.0
            intensity = magnitude / 9.0

            # update buildings (sway & collapse)
            for b in buildings:
                dx = b['x'] - epicenter[0]
                dz = b['z'] - epicenter[1]
                dist = math.hypot(dx, dz)
                damper = max(0.05, 1.0 - (dist / (CITY_RADIUS*1.6)))
                shake_mag = intensity * damper * (1.6 + (1.0 - max(0, (duration-t)) / duration))
                sway_x = math.sin((elapsed*5)+b['x'])*0.04*shake_mag
                sway_z = math.cos((elapsed*5)+b['z'])*0.04*shake_mag
                b['sway_x'] = sway_x
                b['sway_z'] = sway_z
                # collapse chance per frame
                if (not b['collapsed']) and random.random() < (0.002 * magnitude * damper):
                    b['collapsed'] = True
                    # spawn debris
                    for _ in range(6):
                        debris.append({'x': b['x'] + random.uniform(-0.2,0.2), 'y': b['orig_y'] + 0.2, 'z': b['z'] + random.uniform(-0.2,0.2), 'vx': random.uniform(-0.6,0.6), 'vy': random.uniform(0.6,1.8), 'vz': random.uniform(-0.6,0.6), 'life': 0.0})

            # sometimes spawn rings
            if random.random() < 0.04 * intensity:
                rings.append({'r': 0.5, 'age': 0.0, 'intensity': intensity})

            # advance rings and debris
            for r in rings:
                r['age'] += 1.0/fps
                r['r'] += (2.4 + r['intensity']*6.0)/fps
            rings = [r for r in rings if r['r'] < scale*4]

            new_debris = []
            for d in debris:
                d['vy'] -= 9.8 * (1.0/fps) * 0.06
                d['x'] += d['vx'] * (1.0/fps)
                d['y'] += d['vy'] * (1.0/fps)
                d['z'] += d['vz'] * (1.0/fps)
                d['life'] += 1.0/fps
                if d['life'] < 4.0 and d['y'] > -2:
                    new_debris.append(d)
            debris = new_debris

            # render frame with PIL
            img = Image.new('RGBA', (width, height), (12,14,18,255))
            draw = ImageDraw.Draw(img, 'RGBA')

            # center point mapping
            cx = width//2
            cz = height//2

            def world_to_pixel(wx, wz):
                px = int(cx + wx * scale)
                pz = int(cz + (-wz) * scale)
                return px, pz

            # draw ground grid lightly
            for gx in range(-10, 11):
                x1, y1 = world_to_pixel(gx*1.0, -10)
                x2, y2 = world_to_pixel(gx*1.0, 10)
                draw.line([(x1,y1),(x2,y2)], fill=(22,24,28,60))
            for gz in range(-8, 9):
                x1, y1 = world_to_pixel(-10, gz*1.0)
                x2, y2 = world_to_pixel(10, gz*1.0)
                draw.line([(x1,y1),(x2,y2)], fill=(22,24,28,60))

            # draw rings as translucent circles
            for r in rings:
                rpx, rpy = world_to_pixel(0,0)
                rr = int(r['r'] * scale)
                bbox = [rpx-rr, rpy-rr, rpx+rr, rpy+rr]
                alpha = int(140 * (1.0 - r['age']/2.5))
                if alpha<0: alpha=0
                draw.ellipse(bbox, outline=(160,200,255, alpha), width=3)

            # draw buildings (top-down rectangles) — color by height
            for b in buildings:
                px, pz = world_to_pixel(b['x'] + b.get('sway_x',0.0), b['z'] + b.get('sway_z',0.0))
                h = b['height']
                w = max(4, int(6 - (h/3)))
                col = (150 + int(max(-30, min(30, (h-6)))), 120, 120)
                rect = [px-w, pz-w, px+w, pz+w]
                draw.rectangle(rect, fill=col)
                if b['collapsed']:
                    # darken and add cracks
                    draw.rectangle(rect, fill=(80,60,60))
                    # little rubble
                    for i in range(4):
                        rx = px + random.randint(-w, w)
                        ry = pz + random.randint(-w, w)
                        draw.rectangle((rx, ry, rx+2, ry+2), fill=(110,100,90))

            # draw debris
            for d in debris:
                px, pz = world_to_pixel(d['x'], d['z'])
                py = int(cz - d['y'] * (scale*0.18))
                draw.rectangle((px-1, py-1, px+1, py+1), fill=(110,100,90))

            # HUD / text
            draw.rectangle((6,6,320,52), fill=(16,18,24,200))
            draw.text((12,10), f'Magnitude: {magnitude:.1f}   t={t:.1f}s', fill=(230,230,230))

            # save frame
            fname = os.path.join(outdir, f'frame_headless_{int(time.time())}_{frame:04d}.png')
            img.convert('RGB').save(fname, quality=85)
            frames.append(fname)

        # write GIF if possible
        try:
            if imageio and frames:
                gif_name = os.path.join(outdir, f'quake_headless_M{magnitude:.1f}_{int(time.time())}.gif')
                with imageio.get_writer(gif_name, mode='I', duration=1.0/fps) as writer:
                    for f in frames:
                        writer.append_data(imageio.imread(f))
                print('Saved headless GIF:', gif_name)
            # attempt to register with local gallery
            try:
                import requests
                resp = requests.post('http://127.0.0.1:5000/register', json={'path': gif_name}, timeout=1.0)
                if resp.ok:
                    print('Registered headless GIF with gallery:', resp.json())
                else:
                    print('Gallery register failed:', resp.status_code, resp.text)
            except Exception as e:
                print('Gallery register failed:', e)
        except Exception as e:
            print('Failed to create GIF:', e)

        return frames

# --- Config ---
# If headless mode was requested, run the headless exporter now and exit (no OpenGL)
if HEADLESS_MODE:
    mag = STARTUP_MAGNITUDE if STARTUP_MAGNITUDE is not None else DEFAULT_MAG
    ep_tuple = (STARTUP_EPICENTER[0], STARTUP_EPICENTER[2]) if STARTUP_EPICENTER else (0.0, 0.0)
    _headless_simulate(magnitude=mag, epicenter=ep_tuple, duration=max(5.0, mag/1.2), fps=20)
    sys.exit(0)

SCENE_SIZE = 40  # grid size (odd number centers better)
GRID_SPACING = 1.0
CITY_RADIUS = 9.0
DEFAULT_MAG = 7.8
SOUND_FILE = 'sounds/Shaking(EN).mp3'
QUAKE_DURATION = 6.0
DEBRIS_LIFETIME = 6.0

app = Ursina()
window.title = 'PyQuake — Impressive Earthquake Demo'
window.color = color.rgb(14, 18, 24)

# simple ambient lighting
DirectionalLight(direction=Vec3(1,-1,-1), color=color.rgb(180,180,180))
AmbientLight(color=color.rgb(60,60,70))

# Camera
player = FirstPersonController(y=2.0, speed=10)
player.cursor.visible = False
player.gravity = 0  # keep stable movement

# HUD
mag_text = Text(text=f'Magnitude: {DEFAULT_MAG:.1f}', position=(-0.75, 0.45), scale=1.3, background=True)
info_text = Text(text='1: M7.8 megathrust  •  2: M6.2 shallow urban  •  SPACE: trigger quake  •  R: reset', position=(-0.75, 0.40), scale=0.7, background=True)
status = Text(text='', position=(-0.75, 0.35), scale=0.9, background=True)

# Ground plane (big)
ground = Entity(model='plane', scale=(SCENE_SIZE*GRID_SPACING*1.3,1,SCENE_SIZE*GRID_SPACING*1.3), texture='white_cube', texture_scale=(SCENE_SIZE/2,SCENE_SIZE/2), color=color.rgb(18,20,25))

# Procedural low-res terrain using cubes (for visible displacement)
terrain = []
half = SCENE_SIZE//2
random.seed(42)
for x in range(-half, half+1):
    for z in range(-half, half+1):
        h = (math.sin(x*0.2)*0.6 + math.cos(z*0.18)*0.6 + random.uniform(-0.25,0.4)) * 0.8
        h = max(0.2, h + 0.2)
        e = Entity(model='cube', color=color.rgb(40,45,60), scale=(0.95, h, 0.95), position=(x*GRID_SPACING, h/2 - 0.2, z*GRID_SPACING))
        e.original_pos = e.position
        terrain.append(e)

# City: buildings clustered around center
buildings = []
for i in range(100):
    r = random.uniform(1.8, CITY_RADIUS)
    ang = random.uniform(0, math.tau)
    x = math.cos(ang) * r
    z = math.sin(ang) * r
    height = random.uniform(2.0, 18.0) * (1.0 - (r/CITY_RADIUS)*0.85)
    b = Entity(model='cube', color=color.rgb(150+random.randint(-20,20),120,120), scale=(0.9, height, 0.9), position=(x, height/2, z))
    b.original_pos = b.position
    b.collapsed = False
    b.health = 1.0
    buildings.append(b)

# Epicenter marker
epicenter_marker = Entity(model='sphere', color=color.azure, scale=0.6, position=(0,0.6,0))

# Debris list
debris = []

# Ring particles
rings = []

# Earthquake state
quake_active = False
quake_elapsed = 0.0
quake_time_left = 0.0
quake_mag = DEFAULT_MAG
quake_epicenter = Vec3(0,0,0)

# Helper: play sound in thread
def play_shake_sound():
    try:
        playsound(SOUND_FILE)
    except Exception as e:
        print('Sound error:', e)

# --- IPC listener (UDP) -------------------------------------------------
# Listen for local UDP triggers on port 9999 (JSON with 'magnitude' and optional 'epicenter')
import socket, json, queue
ipc_queue = queue.Queue()

# headless renderer moved (definition removed to avoid duplicate)

def _ipc_listener(host='127.0.0.1', port=9999):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
    except Exception as e:
        print(f'IPC listener unavailable ({e}), local triggers will still work')
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

# Start IPC listener in background
threading.Thread(target=_ipc_listener, daemon=True).start()

# --- Screenshot / GIF capture -------------------------------------------------
import os, time
try:
    import imageio
except Exception:
    imageio = None

CAPTURE_DIR = 'screenshots'
os.makedirs(CAPTURE_DIR, exist_ok=True)
CAPTURE_FRAMES_MAX = 40

capturing = False
capture_session = None


def _finalize_capture(session):
    # finalize by creating gif if imageio available, otherwise keep PNG frames
    try:
        if imageio and session and session.get('frames'):
            gif_name = os.path.join(CAPTURE_DIR, f"quake_{session['ts']}.gif")
            with imageio.get_writer(gif_name, mode='I', duration=0.08) as writer:
                for f in session['frames']:
                    im = imageio.imread(f)
                    writer.append_data(im)
            print('Saved GIF:', gif_name)
            # cleanup frames
            for f in session['frames']:
                try:
                    os.remove(f)
                except Exception:
                    pass
            # attempt to register GIF with local gallery server
            try:
                import requests
                resp = requests.post('http://127.0.0.1:5000/register', json={'path': gif_name}, timeout=1.0)
                if resp.ok:
                    print('Registered GIF with gallery:', resp.json())
                else:
                    print('Gallery register failed:', resp.status_code, resp.text)
            except Exception as e:
                print('Gallery register failed:', e)
        elif session and session.get('frames'):
            print('Saved frames to', session['frames'][0].rsplit('_',1)[0] + '_*')
    except Exception as e:
        print('Finalize capture failed:', e)


def _start_capture():
    global capturing, capture_session
    capturing = True
    ts = int(time.time())
    capture_session = {'ts': ts, 'frames': [], 'count': 0}


def _capture_frame():
    global capture_session
    if not capture_session:
        return
    if capture_session['count'] >= CAPTURE_FRAMES_MAX:
        return
    fname = os.path.join(CAPTURE_DIR, f"frame_{capture_session['ts']}_{capture_session['count']:04d}.png")
    try:
        # try ursina's screenshot function if available
        try:
            from ursina import screenshot as _screenshot
            _screenshot(fname)
        except Exception:
            window.screenshot(fname)
    except Exception as e:
        print('Frame capture failed:', e)
        return
    capture_session['frames'].append(fname)
    capture_session['count'] += 1


def _stop_capture():
    global capturing, capture_session
    if capture_session:
        # finalize asynchronously
        session = capture_session
        threading.Thread(target=_finalize_capture, args=(session,), daemon=True).start()
    capture_session = None
    capturing = False

# Trigger quake
def trigger_quake(magnitude, epicenter=(0,0,0), duration=QUAKE_DURATION):
    global quake_active, quake_elapsed, quake_time_left, quake_mag, quake_epicenter
    quake_mag = float(magnitude)
    quake_epicenter = Vec3(*epicenter)
    quake_time_left = duration
    quake_elapsed = 0.0
    quake_active = True
    status.text = f'Quake! M {quake_mag:.1f} — epicenter {quake_epicenter.x:.1f},{quake_epicenter.z:.1f}'
    # spawn initial ring
    spawn_ring(quake_epicenter, intensity=quake_mag/9.0)
    threading.Thread(target=play_shake_sound, daemon=True).start()

# spawn expanding ring of particles
def spawn_ring(center, intensity=0.5, segments=64):
    ring = {'particles': [], 'age': 0.0, 'intensity': intensity}
    for i in range(segments):
        ang = (i/segments) * math.tau
        p = Entity(model='quad', color=color.rgba(180,200,255,120), position=center+Vec3(math.cos(ang)*0.5, 0.05, math.sin(ang)*0.5), scale=0.18, billboard=True)
        p.vel = Vec3(math.cos(ang), 0, math.sin(ang)) * (2.4 + intensity*6.0)
        p.fade = 1.0
        ring['particles'].append(p)
    rings.append(ring)

# spawn debris from a building
def spawn_debris(origin, count=8, scale_min=0.12, scale_max=0.5, intensity=1.0):
    for _ in range(count):
        s = random.uniform(scale_min, scale_max)
        d = Entity(model='cube', color=color.rgb(110,100,90), scale=(s,s,s), position=origin + Vec3(random.uniform(-0.2,0.2), 0.2, random.uniform(-0.2,0.2)))
        d.vel = Vec3(random.uniform(-1,1), random.uniform(0.6,2.2), random.uniform(-1,1)) * (0.8 + intensity)
        d.life = DEBRIS_LIFETIME
        debris.append(d)

# Reset scene
def reset_scene():
    global quake_active, quake_elapsed, quake_time_left, quake_mag
    quake_active = False
    quake_elapsed = quake_time_left = 0.0
    quake_mag = DEFAULT_MAG
    mag_text.text = f'Magnitude: {quake_mag:.1f}'
    status.text = ''
    # restore buildings
    for b in buildings:
        b.position = b.original_pos
        b.rotation_z = b.rotation_x = b.rotation_y = 0
        b.collapsed = False
        b.health = 1.0
    # remove debris & rings
    for d in list(debris):
        destroy(d)
        debris.remove(d)
    for r in list(rings):
        for p in r['particles']:
            destroy(p)
        rings.remove(r)

# Update loop
def update():
    global quake_active, quake_elapsed, quake_time_left
    dt = time.dt
    # process any IPC triggers
    while not ipc_queue.empty():
        try:
            trig = ipc_queue.get_nowait()
            mag = trig.get('magnitude')
            epic = trig.get('epicenter') or trig.get('epicenter_xy') or None
            if epic and isinstance(epic, (list, tuple)) and len(epic) >= 2:
                ep = (float(epic[0]), 0.0, float(epic[1]))
            else:
                ep = (quake_epicenter.x, quake_epicenter.y, quake_epicenter.z)
            if mag:
                trigger_quake(float(mag), epicenter=ep, duration=max(4.0, float(mag)/1.5))
                _start_capture()
        except Exception:
            break

    if quake_time_left > 0:
        quake_elapsed += dt
        quake_time_left -= dt
        # intensity scaling
        intensity = quake_mag/9.0
        # ground wave: vertical offset per terrain piece
        for t in terrain:
            # distance from epicenter
            dist = math.dist((t.original_pos.x, t.original_pos.z), (quake_epicenter.x, quake_epicenter.z))
            # wave travel speed & decay
            travel = quake_elapsed*6.0
            phase = max(0.0, 1.0 - abs(dist - travel)/6.0)
            hoffset = math.sin(quake_elapsed*8 + dist*0.6)*0.08*intensity*phase
            t.position = t.original_pos + Vec3(0, hoffset, 0)
        # building shaking and collapse
        for b in buildings:
            dist = math.dist((b.original_pos.x, b.original_pos.z), (quake_epicenter.x, quake_epicenter.z))
            damper = max(0.05, 1.0 - (dist / (CITY_RADIUS*1.6)))
            shake_mag = intensity * damper * (1.6 + (1.0 - quake_time_left/QUAKE_DURATION))
            # apply swaying
            b.position = b.original_pos + Vec3(math.sin((quake_elapsed*5)+b.original_pos.x)*0.04*shake_mag, 0, math.cos((quake_elapsed*5)+b.original_pos.z)*0.04*shake_mag)
            b.rotation_z = math.sin(quake_elapsed*6 + b.original_pos.x) * 6.0 * shake_mag
            # damage and collapse chance
            if not b.collapsed and random.random() < (0.002 * quake_mag * damper):
                b.collapsed = True
                # spawn debris and start falling/tilting
                spawn_debris(b.position + Vec3(0,b.scale_y/2,0), count=10, intensity=quake_mag/7.0)
            if b.collapsed:
                # rotate and drop
                b.rotation_z += dt * (20.0 * (0.6 + intensity))
                b.position += Vec3(math.sin(b.rotation_z)*0.01, -dt*0.5*(0.5+intensity), 0)
        # spawn rings over time
        if random.random() < 0.04 * intensity:
            spawn_ring(quake_epicenter, intensity=quake_mag/9.0)
        # camera shake
        cam_shake = Vec3(random.uniform(-1,1), random.uniform(-1,1), 0) * (0.06 * intensity * (1.0 + quake_elapsed/QUAKE_DURATION))
        camera.world_position += cam_shake

        # capture a frame if capturing
        if capturing:
            _capture_frame()
            # stop capture early if reached max frames
            if capture_session and capture_session['count'] >= CAPTURE_FRAMES_MAX:
                _stop_capture()
    else:
        # relax: lerp to original positions
        for t in terrain:
            t.position = lerp(t.position, t.original_pos, dt*3)
        for b in buildings:
            if not b.collapsed:
                b.position = lerp(b.position, b.original_pos, dt*3)
                b.rotation_z = lerp(b.rotation_z, 0, dt*3)
        if status.text:
            status.text = ''

    # update debris
    for d in list(debris):
        d.life -= dt
        d.vel += Vec3(0, -9.8, 0) * dt * 0.06
        d.position += d.vel * dt
        d.scale *= (1.0 - dt*0.1)
        d.color = d.color.tint(-dt*5)
        if d.life <= 0 or d.position.y < -2:
            destroy(d)
            debris.remove(d)

    # update rings
    for r in list(rings):
        r['age'] += dt
        for p in r['particles']:
            p.position += p.vel * dt
            p.fade -= dt * 0.25
            p.color = p.color.tint(-0.6*dt)
            p.scale *= (1.0 + dt*0.6)
            p.rotation_y += dt*40
            p.opacity = max(0, p.fade)
            if p.fade <= 0:
                destroy(p)
        # remove ring if all particles gone
        if all(getattr(p, 'fade', 0) <= 0 for p in r['particles']):
            rings.remove(r)

# Input
def input(key):
    global quake_mag
    if key == '1':
        # M7.8 megathrust - epicenter off-center (simulate ocean)
        trigger_quake(7.8, epicenter=(8,0, -8), duration=8.0)
        mag_text.text = f'Magnitude: {7.8:.1f}'
        _start_capture()
    elif key == '2':
        # M6.2 shallow urban
        trigger_quake(6.2, epicenter=(2,0,1), duration=5.0)
        mag_text.text = f'Magnitude: {6.2:.1f}'
        _start_capture()
    elif key == 'space':
        trigger_quake(quake_mag, epicenter=(0,0,0))
        _start_capture()
    elif key == 'r':
        reset_scene()
    elif key == 'escape':
        application.quit()

# Instructions
print('Impressive PyQuake demo — presets: 1 (M7.8), 2 (M6.2). Use WASD + mouse to move. SPACE to trigger.')

# If headless mode requested at CLI, run the headless renderer and exit
if HEADLESS_MODE:
    mag = STARTUP_MAGNITUDE if STARTUP_MAGNITUDE is not None else DEFAULT_MAG
    ep_tuple = (STARTUP_EPICENTER[0], STARTUP_EPICENTER[2]) if STARTUP_EPICENTER else (0.0, 0.0)
    _headless_simulate(magnitude=mag, epicenter=ep_tuple, duration=max(5.0, mag/1.2), fps=20)
    sys.exit(0)

# If started with CLI magnitude and not headless, trigger immediately and capture
try:
    if STARTUP_MAGNITUDE is not None:
        mag = float(STARTUP_MAGNITUDE)
        ep = STARTUP_EPICENTER if STARTUP_EPICENTER else (0,0,0)
        mag_text.text = f'Magnitude: {mag:.1f}'
        trigger_quake(mag, epicenter=ep, duration=max(5.0, mag/1.2))
        _start_capture()
except Exception as e:
    print('Startup trigger failed:', e)

app.run()