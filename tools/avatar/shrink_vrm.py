# VRoid CC0 모델(.vrm)을 앱용으로 가볍게: 무늬(텍스처)를 줄이고 미리보기 그림을 뺌 (2026-11-27 아바타 1단계)
# 쓰기: python3 -I shrink_vrm.py <입력.vrm> <출력.glb> [최대 한 변 px=1024] [머리카락 무늬 밝게=0|1]
# 원본: Documents\mumuride\avatar\vroid\ (opengameart.org 「VRoid Studio CC0 models」, 파일 안 라이선스 표기 CC0)
import json, struct, sys, io
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]; MAXS = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
b = open(src, 'rb').read(); assert b[:4] == b'glTF'
jl = struct.unpack('<I', b[12:16])[0]; g = json.loads(b[20:20 + jl]); off = 20 + jl; bl = struct.unpack('<I', b[off:off + 4])[0]; BIN = b[off + 8:off + 8 + bl]
views = g['bufferViews']; data = [bytearray(BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]) for v in views]
small = {'Shader_NoneNormal', 'Shader_NoneBlack', 'Thumbnail'}; rep = []
for im in g.get('images', []):
    bv = im['bufferView']; I = Image.open(io.BytesIO(bytes(data[bv]))); w0, h0 = I.size; name = im.get('name', '')
    lim = 8 if name in small else (256 if 'Matcap' in name else (MAXS // 2 if ('_nml' in name or '_out' in name or 'Eye' in name or 'Brow' in name or 'Mouth' in name or 'Tie' in name or 'Shoes' in name) else MAXS))
    if max(w0, h0) > lim: I = I.resize((max(1, w0 * lim // max(w0, h0)), max(1, h0 * lim // max(w0, h0))), Image.LANCZOS)
    o = io.BytesIO(); I.save(o, 'PNG', optimize=True); data[bv] = bytearray(o.getvalue()); rep.append((name, w0, I.size[0], len(o.getvalue())))
out = bytearray()
for v, d in zip(views, data):
    while len(out) % 4: out.append(0)
    v['byteOffset'] = len(out); v['byteLength'] = len(d); out += d
while len(out) % 4: out.append(0)
g['buffers'][0]['byteLength'] = len(out)
js = json.dumps(g, separators=(',', ':'), ensure_ascii=False).encode('utf-8'); js += b' ' * (-len(js) % 4)
open(dst, 'wb').write(b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(out)) + b'BIN\x00' + bytes(out))
print(dst, 'MB', round((28 + len(js) + len(out)) / 1e6, 2), 'images', [(n, a, c, s // 1024) for n, a, c, s in rep])
