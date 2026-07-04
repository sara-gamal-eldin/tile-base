#!/usr/bin/env python3
"""
Cinematic zoom-pan effect for demo_4k_2x.mp4.

StreamGL UI layout (3840x2160 @ 2x scale):
  Header bar:    y = 0..96
  Left panel:    x = 0..520
  Map:           x = 520..3840, y = 96..2060
  Export bar:    y = 2060..2160
  Ingest panel:  x = 2600..3840 (right overlay)

Zoom events timed to the demo:
  t=8-20:   Ingest panel — paste URL
  t=28-42:  Pipeline progress running
  t=52-66:  Map loads with data
  t=74-88:  Layer panel symbology
  t=96-112: Export bar / QGIS connect
  t=118-133 Final map overview

Each event: 1.5s ease-in → hold → 1.5s ease-out.
NOTE: FFmpeg crop filter uses 'n' (frame number), not 't'.
      At 60fps: t = n/60
"""

import subprocess, os

INPUT  = "/Users/sarah/Documents/Geosolvix/streamgl/demo_4k_2x.mp4"
OUTPUT = "/Users/sarah/Documents/Geosolvix/streamgl/demo_cinematic.mp4"

W, H   = 3840, 2160
FPS    = 60
TEASE  = 1.5   # seconds ease in / ease out

# (t_start, t_end, center_x, center_y, zoom_factor)
EVENTS = [
    ( 8,  20, 3200,  420, 2.2),
    (28,  42, 3000,  900, 2.0),
    (52,  66, 2200, 1100, 1.7),
    (74,  88,  280,  940, 2.4),
    (96, 112, 1960, 2080, 2.8),
    (118,133, 2100, 1080, 1.5),
]

def s_expr(ts, te):
    """
    Returns FFmpeg expression for linear ease-in/hold/ease-out [0..1..0]
    over [ts, te] seconds, using frame variable 'n' at FPS frames/sec.
    """
    ns  = ts  * FPS
    ne  = te  * FPS
    nin = TEASE * FPS  # ease frames
    # s_in:  0→1 over [ns, ns+nin]   → clip((n-ns)/nin, 0, 1)
    # s_out: 1→0 over [ne-nin, ne]   → 1 - clip((n-(ne-nin))/nin, 0, 1)
    # combined = min(s_in, s_out), active only when n in [ns, ne]
    return (
        f"if(between(n,{ns:.0f},{ne:.0f}),"
        f"min(if(lt(n,{ns+nin:.0f}),n/{nin:.0f}-{ns/nin:.6f},1),"
        f"    if(gt(n,{ne-nin:.0f}),({ne:.0f}-n)/{nin:.0f},1)),"
        f"0)"
    )

def build(full, fn_delta):
    expr = str(int(full))
    for ts, te, cx, cy, z in EVENTS:
        d = fn_delta(cx, cy, z)
        if abs(d) > 0.01:
            expr = f"({expr}+({d:.4f})*{s_expr(ts,te)})"
    return expr

def delta_w(cx, cy, z):  return W/z - W
def delta_h(cx, cy, z):  return H/z - H
def delta_x(cx, cy, z):
    cw = W/z
    return max(0.0, min(W - cw, cx - cw/2))
def delta_y(cx, cy, z):
    ch = H/z
    return max(0.0, min(H - ch, cy - ch/2))

crop_w = build(W, delta_w)
crop_h = build(H, delta_h)
crop_x = build(0, delta_x)
crop_y = build(0, delta_y)

vf = (
    f"crop=w='{crop_w}':h='{crop_h}':x='{crop_x}':y='{crop_y}',"
    f"scale={W}:{H}:flags=lanczos,"
    f"eq=contrast=1.10:saturation=1.18:brightness=0.015:gamma=0.97,"
    f"vignette=PI/4.5"
)

print(f"Filter length: {len(vf)} chars")
print(f"W expr: {crop_w[:120]}...")

cmd = [
    "ffmpeg", "-y",
    "-i", INPUT,
    "-vf", vf,
    "-c:v", "libx264", "-preset", "slow", "-crf", "14",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    OUTPUT,
]

print("\nRunning FFmpeg (this will take a few minutes)…")
result = subprocess.run(cmd)
print("Exit code:", result.returncode)
if result.returncode == 0:
    size = os.path.getsize(OUTPUT) / 1024 / 1024
    print(f"\nDone → {OUTPUT} ({size:.1f} MB)")
