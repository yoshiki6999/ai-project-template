import struct, json, sys, math
D = sys.argv[1]; OUT = sys.argv[2]
W, E, S, N = 134.25, 136.45, 33.40, 35.80  # 关西全域：姬路—京都—琵琶湖—奈良—和歌山—纪伊半岛西岸
def read(meta, dat, want_types=None):
    polys = []
    with open(f"{D}/{meta}") as m, open(f"{D}/{dat}", "rb") as f:
        for line in m:
            p = line.split()
            typ, npts, south, north, off, cnt = int(p[0]), int(p[2]), float(p[3]), float(p[4]), int(p[5]), int(p[6])
            if north < S or south > N: continue
            f.seek(off); buf = f.read(cnt)
            pts = list(struct.iter_unpack('<ff', buf))
            lons = [a for a, _ in pts]
            if max(lons) < W or min(lons) > E: continue
            if max(lons) - min(lons) > 20: continue  # skip continent-spanning rings (Eurasia)
            polys.append((typ, pts))
    return polys
def clip(poly):  # Sutherland-Hodgman against rectangle
    def inside(p, e):
        x, y = p
        return {'W': x >= W, 'E': x <= E, 'S': y >= S, 'N': y <= N}[e]
    def inter(a, b, e):
        (x1, y1), (x2, y2) = a, b
        if e in 'WE':
            X = W if e == 'W' else E; t = (X - x1) / (x2 - x1); return (X, y1 + t * (y2 - y1))
        Y = S if e == 'S' else N; t = (Y - y1) / (y2 - y1); return (x1 + t * (x2 - x1), Y)
    out = poly
    for e in 'WESN':
        inp, out = out, []
        if not inp: break
        prev = inp[-1]
        for cur in inp:
            if inside(cur, e):
                if not inside(prev, e): out.append(inter(prev, cur, e))
                out.append(cur)
            elif inside(prev, e): out.append(inter(prev, cur, e))
            prev = cur
    return out
def rdp(pts, eps):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); (x1, y1), (x2, y2) = pts[a], pts[b]; dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1e-12
        best, bi = -1, -1
        for i in range(a + 1, b):
            x, y = pts[i]; d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / L
            if d > best: best, bi = d, i
        if best > eps: keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]
def eps_for(pts):  # finer detail near Kada / Tomogashima / Wakayama
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    if 134.95 < cx < 135.25 and 34.15 < cy < 34.32: return 0.00025  # 加太/友岛/和歌山细节
    if 135.0 < cx < 135.9 and 34.3 < cy < 35.1: return 0.0006   # 大阪湾、京阪神
    return 0.0012
land, lakes, rivers = [], [], []
for typ, pts in read('gshhsmeta_f.dat', 'gshhs_f.dat'):
    c = clip(pts)
    if len(c) < 4: continue
    # split eps: simplify in chunks so detail varies along Honshu coast
    if c[0] == c[-1]: c = c[:-1]
    # split the ring at the point farthest from its start so RDP never sees a zero-length chord
    far = max(range(len(c)), key=lambda i: (c[i][0]-c[0][0])**2 + (c[i][1]-c[0][1])**2)
    halves = [c[:far + 1], c[far:] + [c[0]]]
    out = []
    for h in halves:
        for i in range(0, len(h) - 1, 400):
            seg = h[i:i + 401]; out += rdp(seg, eps_for(seg))[:-1]
    if len(out) < 4: continue
    ring = [[round(x, 4), round(y, 4)] for x, y in out]
    (land if typ in (1, 3) else lakes).append(ring)
for typ, pts in read('riversmeta_f.dat', 'rivers_f.dat'):
    inb = [p for p in pts if W <= p[0] <= E and S <= p[1] <= N]
    if len(inb) < 3: continue
    r = rdp(inb, 0.0006)
    rivers.append([[round(x, 4), round(y, 4)] for x, y in r])
data = {"bbox": [W, S, E, N], "land": land, "water": lakes, "rivers": rivers, "source": "GSHHG v2.3 (full res) via basemap-data-hires, LGPL"}
json.dump(data, open(OUT, 'w'), separators=(',', ':'))
print('land', len(land), sum(len(r) for r in land), 'water', len(lakes), 'rivers', len(rivers), sum(len(r) for r in rivers))
