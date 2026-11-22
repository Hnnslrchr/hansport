# Schummerung (Relief) für hansport aus AWS Terrain Tiles (Terrarium, z12).
# Eingabe: E.npy (n×256×256 Höhen in m), xy.npy (Kachelkoordinaten z12).
# Ausgabe: Graustufen-JPEG-Atlanten (4×4 Kacheln, 1024 px) je Zoomstufe 9–12, 128 = eben/neutral.
import json, math, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
E = np.load(os.path.join(src, 'E.npy')).astype(np.float32)
xy = np.load(os.path.join(src, 'xy.npy')).astype(np.int64)
Z = 12
X0, Y0 = (int(xy[:, 0].min()) >> 3) << 3, (int(xy[:, 1].min()) >> 3) << 3   # an z9 ausrichten
X1, Y1 = ((int(xy[:, 0].max()) >> 3) << 3) + 7, ((int(xy[:, 1].max()) >> 3) << 3) + 7
W, H = (X1 - X0 + 1) * 256, (Y1 - Y0 + 1) * 256
dem = np.full((H, W), np.nan, np.float32)
for k, (x, y) in enumerate(xy):
    dem[(y - Y0) * 256:(y - Y0 + 1) * 256, (x - X0) * 256:(x - X0 + 1) * 256] = E[k]
# Ausreißer (Datenfehler) durch Median der Umgebung ersetzen
bad = (dem < -100) | (dem > 4000)
if bad.any():
    med = ndimage.median_filter(np.nan_to_num(dem, nan=0), size=5)
    dem[bad] = med[bad]
print('mosaic', W, H, 'outliers', int(bad.sum()))

AZ = [(315, 0.5), (270, 0.2), (0, 0.2), (225, 0.1)]
ALT = math.radians(45)
ZF = {12: 1.35, 11: 1.6, 10: 2.0, 9: 2.6}

def shade(d, z, y_tile0):
    h, w = d.shape
    # Meter je Pixel je Zeile (Breite aus der Mercator-Zeile)
    rows = np.arange(h) + 0.5
    n = math.pi - 2 * math.pi * (y_tile0 * 256 + rows) / (256 * 2 ** z)
    lat = np.arctan(np.sinh(n))
    res = (156543.03392 * np.cos(lat) / 2 ** z).astype(np.float32)[:, None]
    p = np.pad(d, 1, mode='edge')
    a, b, c = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    dd, f = p[1:-1, :-2], p[1:-1, 2:]
    g, hh, i = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * dd + g)) / (8 * res) * ZF[z]
    dzdy = ((g + 2 * hh + i) - (a + 2 * b + c)) / (8 * res) * ZF[z]
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(dzdy, -dzdx)
    I = np.zeros_like(d)
    for az, wgt in AZ:
        azr = math.radians(360 - az + 90)
        I += wgt * (math.sin(ALT) * np.cos(slope) + math.cos(ALT) * np.sin(slope) * np.cos(azr - aspect))
    v = 128 + (I - math.sin(ALT)) * 190
    v = np.where(np.isnan(v), 128, v)
    return np.clip(np.round(v), 0, 255).astype(np.uint8)

os.makedirs(out, exist_ok=True)
index = {}
total = 0
d = dem
for z in (12, 11, 10, 9):
    if z < 12:
        h2, w2 = d.shape[0] // 2, d.shape[1] // 2
        d = np.nanmean(d[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2), axis=(1, 3))
    s = Z - z
    tx0, ty0 = X0 >> s, Y0 >> s
    img = shade(d, z, ty0)
    valid = ~np.isnan(d)
    nty, ntx = img.shape[0] // 256, img.shape[1] // 256
    keys = []
    for ay in range(ty0 >> 2, ((ty0 + nty - 1) >> 2) + 1):
        for ax in range(tx0 >> 2, ((tx0 + ntx - 1) >> 2) + 1):
            atlas = np.full((1024, 1024), 128, np.uint8)
            any_valid = False
            for j in range(4):
                for i in range(4):
                    tx, ty = ax * 4 + i, ay * 4 + j
                    if not (tx0 <= tx < tx0 + ntx and ty0 <= ty < ty0 + nty):
                        continue
                    sl = (slice((ty - ty0) * 256, (ty - ty0 + 1) * 256), slice((tx - tx0) * 256, (tx - tx0 + 1) * 256))
                    if valid[sl].mean() < 0.02:
                        continue
                    atlas[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = img[sl]
                    any_valid = True
            if not any_valid:
                continue
            fn = os.path.join(out, f'r{z}_{ax}_{ay}.jpg')
            Image.fromarray(atlas, 'L').save(fn, quality=78, optimize=True, progressive=False)
            total += os.path.getsize(fn)
            keys.append([ax, ay])
    index[str(z)] = keys
    print('z', z, 'atlases', len(keys))
json.dump({'v': 1, 'size': 1024, 'neutral': 128, 'levels': index}, open(os.path.join(out, 'index.json'), 'w'))
print('total MB', round(total / 1048576, 2))
