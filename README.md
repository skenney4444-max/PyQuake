### English (orginal):
# PyQuake - terminal EEW
PyTremor is a prototype Earthquake Early Warning (EEW) monitoring tool that listens to various real-time EEW data sources using WebSocket connections. It provides detailed earthquake alerts for multiple regions, including Japan, China, and other parts of Asia.
This is an early-stage project and is not yet production-ready. Feedback and contributions are highly encouraged to improve the system.

Features
Multi-Region Support: Receives EEW alerts from:

- Japan Meteorological Agency (JMA EEW)
- China Earthquake Networks Center (CENC EEW)
- China Earthquake Administration (CWA EEW)
- Sichuan EEW (SC EEW)
- Fujian EEW (FJ EEW)
Real-Time Alerts: Displays detailed information such as magnitude, depth, location, maximum intensity, and more.

## 3D Demo (PyQuake Demo) ✅
Try a simple 3D earthquake demo built with `ursina`.

- Run: `python demo_3d.py`
- Controls: Number keys `1`–`9` to set magnitude, `SPACE` to trigger a quake, `R` to randomize the scene.
- Uses a simple building grid and camera; plays `sounds/Shaking(EN).mp3` if present.

## Impressive Demo — M7.8 Megathrust 🌊🔥
A more dramatic demo is included as `demo_impressive.py` that showcases a preset M7.8 megathrust and a M6.2 shallow urban quake. Features:

- Procedural terrain with a central city cluster
- Epicenter visual + expanding seismic wave particles
- Building swaying, collapse, and debris simulation
- Camera shake, HUD, and sound playback

- Run: `python demo_impressive.py`
- Presets: press `1` for M7.8 megathrust, `2` for M6.2 shallow urban, `SPACE` to trigger the current scenario, `R` to reset.

### Auto-triggering & exports
- Run the visual demo (e.g., `python demo_impressive.py`) and then run `main.py` to receive live EEW stream. When `main.py` receives an EEW with magnitude, it will send a local UDP trigger to port `9999` which the demo listens to.
- `main.py` now also **auto-launches** `demo_impressive.py` if it observes a magnitude above **6.0** (configurable via `DEMO_AUTO_LAUNCH_THRESHOLD` in `main.py`). The demo is launched with `--magnitude <value>` so it triggers immediately and captures an export.
- The impressive demo automatically captures a short set of frames when a quake is triggered and will write a short GIF to `screenshots/` (if `imageio` is installed), or PNG frames otherwise.
- For headless environments (CI, remote containers) run:
  - `python demo_impressive.py --magnitude 7.8 --headless` to render the demo and export a GIF without opening a GUI.
- You can run a small gallery server to view generated GIFs in your browser:
  - `python gallery.py` then visit `http://127.0.0.1:5000/` — the demo will attempt to register newly created GIFs with this server automatically.
- Example: simply run `python main.py` — when a large EEW is received the demo will open automatically and start an animation/export (or you may prefer headless on servers).

### Our discord server: https://discord.gg/V6BXY9A6vv

# IMPORTANT:
Please keep in mind this project is old, a lot of parts of it were not tested and probably contains a lot of bugs

