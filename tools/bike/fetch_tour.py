# 관광지 코스 4개 (2026-11-27 무무 님 요청: 경주 보문호·불국사 / 춘천 의암호 / 강릉 경포호·해변 / 한강 여의도~반포)
# 1) 호수 둘레는 OSM 호수 모양에서 동서남북 끝점을 바깥으로 밀어 경유점으로 씀  2) 자전거 길찾기(OSRM bike)로 길 모양
# 3) 높이: AWS Terrarium 높이 타일(z14)에서 25 m마다 읽고, 다리·댐 위에서 물 높이로 꺼지는 곳은 「닫힘(최대→최소) 필터」로 메움
# 실행: python fetch_tour.py [코스id ...]   결과: <id>.json (len, pts, elev, elevStep 25, turnAt)
import truststore; truststore.inject_into_ssl()
import json, math, os, sys, io, time, urllib.request, urllib.parse
import numpy as np
from PIL import Image
BASE = r'C:\Users\Bak Byeongseob\Documents\muride'; CACHE = os.path.join(BASE, 'terrain', 'cache'); os.makedirs(CACHE, exist_ok=True)
UA = {'User-Agent': 'muride/1.0 (moomooissue@gmail.com)'}
BIKE = 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/'

def get(url, data=None, tries=5):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            return urllib.request.urlopen(req, timeout=180).read()
        except Exception as e:
            print('  다시', k + 1, e, flush=True); time.sleep(5 + 10 * k)
    raise RuntimeError(url)

def dist(a, b): return math.hypot((b[0] - a[0]) * 111320 * math.cos(math.radians(a[1])), (b[1] - a[1]) * 110540)

def lake(name, bbox):
    q = f'[out:json][timeout:90];(way["natural"="water"]["name"="{name}"]({bbox});relation["natural"="water"]["name"="{name}"]({bbox}););out geom;'
    J = json.loads(get('https://overpass-api.de/api/interpreter', urllib.parse.urlencode({'data': q}).encode()))
    pts = []
    for e in J['elements']:
        if e.get('geometry'): pts += [[p['lon'], p['lat']] for p in e['geometry']]
        for m in e.get('members', []):
            if m.get('role') == 'outer' and m.get('geometry'): pts += [[p['lon'], p['lat']] for p in m['geometry']]
    return pts

def ext(pts, push=90):
    """호수 동서남북 끝점을 가운데에서 바깥으로 push m 밀어 둘레 길 위로"""
    c = [sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)]
    out = {}
    for k, f in (('N', lambda p: p[1]), ('S', lambda p: -p[1]), ('E', lambda p: p[0]), ('W', lambda p: -p[0])):
        p = max(pts, key=f); d = dist(c, p) or 1; t = (d + push) / d
        out[k] = [c[0] + (p[0] - c[0]) * t, c[1] + (p[1] - c[1]) * t]
    return out, c

def around(pts, n=12, push=70, start=None):
    """호수 둘레 경유점: 가운데에서 n개 방향으로 가장 먼 물가 점을 push m 바깥으로. start(경도,위도)에 가장 가까운 방향부터 반시계로"""
    c = [sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)]; kx = 111320 * math.cos(math.radians(c[1])); ky = 110540
    V = [((p[0] - c[0]) * kx, (p[1] - c[1]) * ky) for p in pts]; out = []
    a0 = math.atan2((start[1] - c[1]) * ky, (start[0] - c[0]) * kx) if start else 0
    for i in range(n):
        a = a0 + 2 * math.pi * i / n; u = (math.cos(a), math.sin(a))
        # 그 방향 ±15° 안의 물가 점 중 가장 먼 점
        cand = [v for v in V if math.hypot(*v) > 1 and (v[0] * u[0] + v[1] * u[1]) / math.hypot(*v) > math.cos(math.radians(15))]
        if not cand: continue
        v = max(cand, key=lambda v: math.hypot(*v)); r = math.hypot(*v) + push
        out.append([c[0] + u[0] * 0 + v[0] / math.hypot(*v) * r / kx, c[1] + v[1] / math.hypot(*v) * r / ky, math.degrees(a - a0)])
    return out, c

def despur(P, win=1500, tol=10, keep=None):
    """되돌아 나오는 짧은 갈래 잘라내기: i 에서 나갔다가 win m 안에 tol m 안으로 돌아오면 그 사이를 뺌"""
    out = []; i = 0; n = len(P)
    while i < n:
        out.append(P[i]); cut = None; acc = 0
        for j in range(i + 1, n):
            acc += dist(P[j - 1], P[j])
            if acc > win: break
            if acc > 3 * tol and dist(P[i], P[j]) < tol and not (keep and any(dist(P[q], keep) < 300 for q in range(i, j + 1, 5))): cut = j  # keep: 일부러 되돌아 나오는 반환점은 남김
        i = cut + 1 if cut else i + 1
    return out

def route(wps):
    s = ';'.join(f'{p[0]:.5f},{p[1]:.5f}' for p in wps)
    r = json.loads(get(BIKE + s + '?overview=full&geometries=geojson'))
    return r['routes'][0]['geometry']['coordinates'], r['routes'][0]['distance']

def resample(pts, step):
    out = [pts[0]]; acc = 0.0; i = 1; prev = pts[0]
    while i < len(pts):
        d = dist(prev, pts[i])
        if d > 0 and acc + d >= step:
            t = (step - acc) / d; prev = [prev[0] + (pts[i][0] - prev[0]) * t, prev[1] + (pts[i][1] - prev[1]) * t]; out.append(prev); acc = 0.0
        else: acc += d; prev = pts[i]; i += 1
    if dist(out[-1], pts[-1]) > 1: out.append(pts[-1])
    return out

TILES = {}
def dem(lon, lat, z=14):
    n = 2 ** z; X = (lon + 180) / 360 * n * 256; r = math.radians(lat); Y = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n * 256
    tx, ty = int(X // 256), int(Y // 256); key = (z, tx, ty)
    if key not in TILES:
        p = os.path.join(CACHE, f'dem_{z}_{tx}_{ty}')
        d = open(p, 'rb').read() if os.path.exists(p) and os.path.getsize(p) > 0 else None
        if d is None: d = get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{tx}/{ty}.png'); open(p, 'wb').write(d)
        a = np.asarray(Image.open(io.BytesIO(d)).convert('RGB')).astype(np.float64); TILES[key] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    A = TILES[key]; x = min(254.999, max(0, X - tx * 256 - 0.5)); y = min(254.999, max(0, Y - ty * 256 - 0.5)); x0, y0 = int(x), int(y); fx, fy = x - x0, y - y0
    return A[y0, x0] * (1 - fx) * (1 - fy) + A[y0, x0 + 1] * fx * (1 - fy) + A[y0 + 1, x0] * (1 - fx) * fy + A[y0 + 1, x0 + 1] * fx * fy

def elevation(samp, step=25, open_m=400, close_m=800, smooth_m=200):
    """높이 다듬기 (2026-11-27 관광지 코스): ① 빈값·튀는 값 거르기(중앙값 200 m) ② 열림 400 m — 강변도로 위 고가·제방·다리 위로 솟은 좁은 봉우리 제거
       ③ 닫힘 800 m — 다리·댐 위에서 물 높이로 꺼진 곳 메움 ④ 평균 200 m. 넓은 진짜 언덕(불국사 오르막)은 그대로 남음"""
    e = np.clip(np.array([dem(p[0], p[1]) for p in samp]), -20, 3000); n = len(e)
    W = lambda a, m, f: np.array([f(a[max(0, i - max(1, int(m / step / 2))):i + max(1, int(m / step / 2)) + 1]) for i in range(n)])
    md = W(e, 200, np.median); op = W(W(md, open_m, np.min), open_m, np.max); cl = W(W(op, close_m, np.max), close_m, np.min); sm = W(cl, smooth_m, np.mean)
    return [round(float(v), 1) for v in sm], float(np.max(np.abs(sm - md)))

# 경유점은 지도(render_tour3.py 로 그린 <id>_osmmap.jpg)를 보고 둘레 길 위에 직접 찍음 (2026-11-27: 호수 끝점 자동 계산은 막다른 길로 빠지는 갈래가 생겼음)
COURSES = {
    # 보문관광단지 → 보문호 북쪽 → 서쪽 물가길 → 남쪽 → 관광단지 (한 바퀴) → 보불로 따라 불국사 → 같은 길로 복귀 (불국사 앞이 반환점)
    'gyeongju': dict(loopWps=[[129.28693, 35.84333], [129.2782, 35.84978], [129.27309, 35.85142], [129.2699, 35.85407], [129.26587, 35.85117], [129.2699, 35.84522], [129.27191, 35.84257], [129.27393, 35.83739], [129.27749, 35.83372], [129.28445, 35.83486], [129.28678, 35.84194], [129.28693, 35.84333]], turn=[129.33089, 35.78899]),
    # 의암호 한 바퀴: 동쪽 강변(공지천·송암) → 의암댐 건너 서쪽 403번 → 북쪽 신매대교 건너 동쪽으로 돌아옴
    'chuncheon': dict(lake=('의암호', '37.82,127.64,37.94,127.75'), plan=lambda L: [L['E'], [127.67584, 37.83606], [127.71637, 37.92209], L['E']]),
    # 경포대 → 운정 → 호수 남쪽 → 강문해변 → 창해로(해변길) 따라 경포해변 → 호수 서쪽 → 경포대
    'gangneung': dict(loopWps=[[128.89628, 37.7948], [128.89478, 37.78903], [128.89993, 37.79039], [128.90765, 37.79819], [128.91173, 37.7987], [128.91795, 37.79649], [128.91323, 37.80056], [128.90594, 37.80446], [128.90207, 37.80107], [128.89757, 37.79768], [128.89628, 37.7948]]),
    # 여의도한강공원 → 한강 남쪽 자전거길 → 반포한강공원(세빛섬) 왕복
    'hangang': dict(plan=lambda L: [[126.93606, 37.52567], [126.99491, 37.51173]]),
}
only = sys.argv[1:]
for cid, c in COURSES.items():
    if only and cid not in only: continue
    L = {}
    if 'lake' in c:
        lp = lake(*c['lake']); L, cen = ext(lp); print(cid, '호수 점', len(lp), flush=True); time.sleep(2)
    if 'loopWps' in c:  # 지도 보고 찍은 경유점으로 한 바퀴 → 갈래 잘라내기 (+ 반환점 다녀오기)
        wl = c['loopWps']; loop, _ = route(wl); loop = despur(resample(loop, 6)); pts = loop; wps = wl
        if 'turn' in c:
            g1, _ = route([wl[0], c['turn']]); g2, _ = route([c['turn'], wl[0]]); pts = despur(resample(loop + g1[1:] + g2[1:], 6), keep=c['turn']); wps = wl + [c['turn']]  # 한 바퀴 끝과 반환점 길이 겹치는 출발점 앞 갈래도 잘라냄 (2026-11-27 경주 8.98 km 갈래)
    elif 'loopStart' in c:  # 호수 한 바퀴: 둘레 경유점(바다 쪽 방향은 해변 점으로 바꿈) → 갈래 잘라내기
        A, cen = around(lp, 12, 70, c['loopStart']); wl = [c['loopStart']] + [a[:2] for a in A[1:]]
        if 'swap' in c: wl = c['swap'](wl, A)
        wl.append(c['loopStart']); loop, _ = route(wl); loop = despur(resample(loop, 6)); wps = wl
        pts = loop
        if 'turn' in c:
            g1, _ = route([c['loopStart'], c['turn']]); g2, _ = route([c['turn'], c['loopStart']]); pts = loop + g1[1:] + g2[1:]; wps = wl + [c['turn']]
    else:
        wps = c['plan'](L); pts, dd = route(wps)
        if len(wps) > 2: pts = despur(resample(pts, 6))
    fine = resample(pts, 12); samp = resample(pts, 25)
    el, fill = elevation(samp)
    if wps[0] == wps[-1] or 'turn' in c:  # 순환 코스: 끝 높이를 출발 높이에 맞춤(한 바퀴 이음매에서 경사가 튀지 않게, 2026-11-27 경주 27% 이음매)
        dlt = el[-1] - el[0]; el = [round(v - dlt * t / (len(el) - 1), 1) for t, v in enumerate(el)]
    length = sum(dist(a, b) for a, b in zip(fine, fine[1:]))
    turnAt = None
    if 'turn' in c:
        acc = 0; best = (1e9, 0)
        for i in range(1, len(fine)):
            acc += dist(fine[i - 1], fine[i]); d = dist(fine[i], c['turn'])
            if d < best[0] and acc > length * 0.3: best = (d, acc)
        turnAt = round(best[1])
    json.dump({'len': round(length), 'pts': [[round(p[0], 6), round(p[1], 6)] for p in fine], 'elev': el, 'elevStep': 25, 'turnAt': turnAt, 'wps': wps}, open(os.path.join(BASE, cid + '.json'), 'w', encoding='utf-8'))
    up = sum(max(0, b - a) for a, b in zip(el, el[1:]))
    print(f'{cid}: {length/1000:.2f} km, 점 {len(fine)}, 높이 {min(el):.0f}~{max(el):.0f} m, 오르막 {up:.0f} m, 다리 메움 최대 {fill:.1f} m, 반환점 {turnAt}', flush=True)
print('완료')
