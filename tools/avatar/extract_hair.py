# VRoid 모델(.vrm)에서 머리카락만 떼어 가벼운 .glb 로 저장 (2026-11-28, 헤어스타일 고르기용)
# - 머리카락 그물(이름이 Hair 로 시작)을 묶음 자세 그대로(뼈 없이) 재질별로 합쳐 담음
# - 머리 그림은 512 로 줄임
# - extras.face: 원래 모델의 얼굴 크기·자리 (반폭 fw, 가운데 cx, 꼭대기 top, 뒤쪽 끝 back, 머리뼈 자리 head) → 다른 캐릭터 머리에 맞출 때 씀
# 사용법: python3 -I tools/avatar/extract_hair.py <in.vrm> <out.glb>
import io, json, struct, sys
import numpy as np
from PIL import Image

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def main(src, dst):
    b = open(src, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    bin0 = 20 + n + 8

    def view(i):
        v = j['bufferViews'][i]
        o = bin0 + v.get('byteOffset', 0)
        return b[o:o + v['byteLength']], v.get('byteStride')

    def acc(i):
        a = j['accessors'][i]
        data, stride = view(a['bufferView'])
        dt, nc = np.dtype(CT[a['componentType']]), NC[a['type']]
        off, size = a.get('byteOffset', 0), dt.itemsize * nc
        if stride and stride != size:
            raw = np.frombuffer(data, np.uint8)[off:off + stride * a['count']].reshape(a['count'], stride)[:, :size].copy()
            return raw.view(dt).reshape(a['count'], nc)
        return np.frombuffer(data, dt, a['count'] * nc, off).reshape(a['count'], nc)

    mats = j['materials']
    # 얼굴 크기 (피부 재질 가운데 삼각형이 가장 많은 조각)
    face = None
    for m in j['meshes']:
        if not m['name'].startswith('Face'):
            continue
        for p in m['primitives']:
            if 'Face_00_SKIN' in mats[p['material']]['name']:
                idx = acc(p['indices']).ravel()
                if face is None or len(idx) > len(face[1]):
                    face = (acc(p['attributes']['POSITION']), idx)
    fp = face[0][np.unique(face[1])]
    mn, mx = fp.min(0), fp.max(0)
    front = -1.0  # VRM 0.x 는 -z 가 앞
    meta = {'fw': float((mx[0] - mn[0]) / 2), 'cx': float((mx[0] + mn[0]) / 2), 'top': float(mx[1]), 'back': float(mx[2] if front < 0 else mn[2])}

    # 머리뼈 자리 (묶음 자세): 부모를 따라 올라가며 이동값을 더함 (VRoid 뼈는 쉬는 회전이 없음)
    par = {c: i for i, nd in enumerate(j['nodes']) for c in nd.get('children', [])}
    hi = next(i for i, nd in enumerate(j['nodes']) if nd.get('name') == 'J_Bip_C_Head')
    hp = np.zeros(3)
    while hi is not None:
        hp += np.array(j['nodes'][hi].get('translation', [0, 0, 0]))
        hi = par.get(hi)
    meta['head'] = [float(v) for v in hp]

    groups = {}  # 재질 번호 → 삼각형 꼭짓점 번호
    hair = [m for m in j['meshes'] if m['name'].startswith('Hair')]
    if not hair:
        raise SystemExit('머리카락 그물이 없음: ' + src)
    P = N = UV = None
    for m in hair:
        for p in m['primitives']:
            if P is None:
                P, N, UV = acc(p['attributes']['POSITION']), acc(p['attributes']['NORMAL']), acc(p['attributes']['TEXCOORD_0'])
            groups.setdefault(p['material'], []).append(acc(p['indices']).ravel().astype(np.uint32))

    # 쉬는 자세로 굽기: 묶음 자세의 꼭짓점을 뼈의 쉬는 자리로 옮김 (v' = Σ 가중치 × 뼈 세계행렬 × 역묶음행렬 × v)
    # ※ 머리카락 뼈(J_Sec_…)는 쉬는 회전이 있어서, 묶음 자세 그대로 쓰면 양갈래가 옆으로 뻗은 채 나옴(2026-11-28 확인)
    def local(nd):
        m = np.eye(4)
        if 'matrix' in nd:
            return np.array(nd['matrix'], float).reshape(4, 4).T
        x, y, z, w = nd.get('rotation', [0, 0, 0, 1])
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        m[:3, :3] = R * np.array(nd.get('scale', [1, 1, 1]))
        m[:3, 3] = nd.get('translation', [0, 0, 0])
        return m
    gm = {}

    def world(i):
        if i not in gm:
            gm[i] = (world(par[i]) if i in par else np.eye(4)) @ local(j['nodes'][i])
        return gm[i]
    hnode = next(nd for nd in j['nodes'] if 'mesh' in nd and j['meshes'][nd['mesh']]['name'].startswith('Hair'))
    skin = j['skins'][hnode['skin']]
    ibm = acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(float)
    M = np.stack([world(jn) @ ibm[k] for k, jn in enumerate(skin['joints'])])
    p0 = hair[0]['primitives'][0]['attributes']
    J, W = acc(p0['JOINTS_0']).astype(int), acc(p0['WEIGHTS_0']).astype(float)
    W = W / np.maximum(W.sum(1, keepdims=True), 1e-9)
    Mv = np.einsum('vk,vkij->vij', W, M[J])
    P = (np.einsum('vij,vj->vi', Mv[:, :3, :3], P.astype(float)) + Mv[:, :3, 3]).astype(np.float32)
    N = np.einsum('vij,vj->vi', Mv[:, :3, :3], N.astype(float))
    N = (N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)).astype(np.float32)
    moved = float(np.abs(P - acc(p0['POSITION'])).max())

    out = {'asset': {'version': '2.0', 'generator': 'mumuride extract_hair'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': 'Hair'}],
           'meshes': [{'name': 'Hair', 'primitives': []}], 'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
           'accessors': [], 'bufferViews': [], 'buffers': [{}], 'extras': {'face': meta, 'source': src.split('/')[-1]}}
    blob = bytearray()

    def add_view(data, target=None):
        while len(blob) % 4:
            blob.append(0)
        v = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
        if target:
            v['target'] = target
        blob.extend(data)
        out['bufferViews'].append(v)
        return len(out['bufferViews']) - 1

    def add_acc(arr, typ, ct, target, minmax=False):
        a = {'bufferView': add_view(arr.tobytes(), target), 'componentType': ct, 'count': len(arr), 'type': typ}
        if minmax:
            a['min'], a['max'] = arr.min(0).tolist(), arr.max(0).tolist()
        out['accessors'].append(a)
        return len(out['accessors']) - 1

    imgs = {}
    for mi, parts in groups.items():
        idx = np.concatenate(parts)
        used, inv = np.unique(idx, return_inverse=True)  # 이 재질이 쓰는 꼭짓점만 추림
        pa = add_acc(np.ascontiguousarray(P[used], np.float32), 'VEC3', 5126, 34962, True)
        na = add_acc(np.ascontiguousarray(N[used], np.float32), 'VEC3', 5126, 34962)
        ua = add_acc(np.ascontiguousarray(UV[used], np.float32), 'VEC2', 5126, 34962)
        ia = add_acc(inv.astype(np.uint32), 'SCALAR', 5125, 34963)
        mat = {'name': mats[mi]['name'], 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 0.8}, 'doubleSided': True}
        mode = mats[mi].get('alphaMode', 'OPAQUE')  # 원래 재질의 투명 방식을 그대로 옮김 — 안 옮기면 불투명 머리가 그림의 투명값 때문에 사라짐(양갈래가 안 보였음)
        if mode != 'OPAQUE':
            mat['alphaMode'] = mode
            if mode == 'MASK':
                mat['alphaCutoff'] = mats[mi].get('alphaCutoff', 0.5)
        tex = mats[mi].get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if tex is not None:
            si = j['textures'][tex['index']]['source']
            if (si, mode) not in imgs:
                data, _ = view(j['images'][si]['bufferView'])
                im = Image.open(io.BytesIO(data)).convert('RGB' if mode == 'OPAQUE' else 'RGBA')
                im.thumbnail((512, 512))
                buf = io.BytesIO()
                im.save(buf, 'PNG', optimize=True)
                out['images'].append({'bufferView': add_view(buf.getvalue()), 'mimeType': 'image/png'})
                out['textures'].append({'source': len(out['images']) - 1, 'sampler': 0})
                imgs[(si, mode)] = len(out['textures']) - 1
            mat['pbrMetallicRoughness']['baseColorTexture'] = {'index': imgs[(si, mode)]}
        out['materials'].append(mat)
        out['meshes'][0]['primitives'].append({'attributes': {'POSITION': pa, 'NORMAL': na, 'TEXCOORD_0': ua}, 'indices': ia, 'material': len(out['materials']) - 1})

    while len(blob) % 4:
        blob.append(0)
    out['buffers'][0]['byteLength'] = len(blob)
    js = json.dumps(out, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(blob), 0x004E4942) + bytes(blob))
    print(dst, round((28 + len(js) + len(blob)) / 1e6, 2), 'MB', '재질', [m.get('alphaMode', 'OPAQUE') for m in out['materials']], '쉬는 자세로 옮긴 최대 거리', round(moved, 3), 'fw', round(meta['fw'], 3), '(꼭대기-머리뼈)/fw', round((meta['top'] - meta['head'][1]) / meta['fw'], 2), '(뒤-머리뼈)z', round(meta['back'] - meta['head'][2], 3))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
