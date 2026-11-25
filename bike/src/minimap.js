// 오른쪽 미니맵(GTA처럼 내가 가운데, 달리는 방향이 위) + 바로 위 바람 나침반
// 미니맵: 위성사진 바탕(실측 코스) + 코스 선(지나온 길은 흐리게) + 내 화살표. 나침반: 북쪽 표시와 바람이 부는 쪽 화살표·풍속
export function makeMinimap(mapCv, cmpCv) {
  const mg = mapCv.getContext('2d'), cg = cmpCv.getContext('2d');
  let path = null, route = null, done = null, img = null, aff = null, lastDraw = 0;
  const RANGE = 420; // 미니맵 반지름이 보여 주는 거리 (m)

  return {
    /** 코스가 바뀔 때: 길 모양을 미리 그려 두고, 위성사진이 있으면 세계 좌표 → 사진 좌표 변환을 구해 둠 */
    setCourse(p, terr) {
      path = p; route = new Path2D(); const st = 4;
      for (let i = 0; i <= p.n; i += st) (i ? route.lineTo(p.x[i], p.z[i]) : route.moveTo(p.x[i], p.z[i]));
      img = null; aff = null;
      if (terr && terr.sat?.image) {
        img = terr.sat.image; const B = terr.box;
        const px = (x, z) => { const [lo, la] = p.lonlat(x, z); return [((lo - B.w) / (B.e - B.w)) * img.width, ((B.n - la) / (B.n - B.s)) * img.height]; };
        const [x0, y0] = px(0, 0), [x1] = px(1000, 0), [, y1] = px(0, 1000);
        aff = { a: (x1 - x0) / 1000, b: x0, c: (y1 - y0) / 1000, d: y0 }; // 사진 x = a·세계x + b, 사진 y = c·세계z + d
      }
    },
    /** rp: 라이더 위치, h: 달리는 방향 {x,z}, d: 간 거리, wind: 바람 벡터 {x(동),y(남)} m/s, wxOn: 실제 날씨 켜짐 */
    draw(rp, h, d, wind, wxOn, force) {
      const now = performance.now(); if (!path || (!force && now - lastDraw < 90)) return; lastDraw = now;
      mg.setTransform(2, 0, 0, 2, 0, 0); const W = mapCv.width / 2, R = W / 2, k = R / RANGE, phi = -Math.PI / 2 - Math.atan2(h.z, h.x); // 달리는 방향을 위로
      mg.save(); mg.clearRect(0, 0, W, W);
      mg.beginPath(); mg.arc(R, R, R - 2, 0, Math.PI * 2); mg.clip();
      mg.fillStyle = '#26313a'; mg.fillRect(0, 0, W, W);
      mg.translate(R, R); mg.rotate(phi); mg.scale(k, k); mg.translate(-rp.x, -rp.z);
      if (img && aff) { mg.save(); mg.transform(1 / aff.a, 0, 0, 1 / aff.c, -aff.b / aff.a, -aff.d / aff.c); mg.globalAlpha = 0.9; mg.drawImage(img, 0, 0); mg.restore(); }
      mg.lineJoin = mg.lineCap = 'round';
      mg.strokeStyle = 'rgba(0,0,0,.55)'; mg.lineWidth = 11 / k; mg.stroke(route);
      mg.strokeStyle = '#ffb020'; mg.lineWidth = 6 / k; mg.stroke(route);
      // 지나온 길 (왕복 코스는 앞 절반만 그려짐) — 흰 선
      const L = path.outback ? Math.min(d, 2 * path.fwd - d) : d % path.length, iEnd = Math.min(path.n, Math.floor(Math.max(0, L) / path.step));
      if (!path.outback || d <= path.fwd) {
        mg.beginPath(); for (let i = 0; i <= iEnd; i += 4) (i ? mg.lineTo(path.x[i], path.z[i]) : mg.moveTo(path.x[i], path.z[i]));
        mg.lineTo(rp.x, rp.z); mg.strokeStyle = 'rgba(255,255,255,.85)'; mg.lineWidth = 4 / k; mg.stroke();
      }
      mg.restore();
      // 내 화살표 (가운데, 위쪽)
      mg.save(); mg.translate(R, R); mg.fillStyle = '#ffffff'; mg.strokeStyle = '#0b1218'; mg.lineWidth = 3;
      mg.beginPath(); mg.moveTo(0, -15); mg.lineTo(11, 12); mg.lineTo(0, 6); mg.lineTo(-11, 12); mg.closePath(); mg.fill(); mg.stroke(); mg.restore();
      // 테두리 + 북쪽 표시
      mg.lineWidth = 4; mg.strokeStyle = 'rgba(255,255,255,.75)'; mg.beginPath(); mg.arc(R, R, R - 3, 0, Math.PI * 2); mg.stroke();
      const nx = R + Math.sin(phi) * (R - 18), ny = R - Math.cos(phi) * (R - 18); // 북쪽(세계 -z)을 같은 회전으로 옮긴 자리
      mg.fillStyle = '#e5484d'; mg.beginPath(); mg.arc(nx, ny, 13, 0, Math.PI * 2); mg.fill();
      mg.fillStyle = '#fff'; mg.font = 'bold 16px sans-serif'; mg.textAlign = 'center'; mg.textBaseline = 'middle'; mg.fillText('N', nx, ny + 1);

      // ---- 바람 나침반 ----
      cg.setTransform(2, 0, 0, 2, 0, 0); const C = cmpCv.width / 2, cr = C / 2; cg.clearRect(0, 0, C, C);
      cg.fillStyle = 'rgba(15,23,32,.82)'; cg.beginPath(); cg.arc(cr, cr, cr - 2, 0, Math.PI * 2); cg.fill();
      cg.strokeStyle = 'rgba(255,255,255,.35)'; cg.lineWidth = 2; cg.stroke();
      cg.save(); cg.translate(cr, cr); cg.rotate(phi);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r0 = i % 2 ? cr - 12 : cr - 16; cg.strokeStyle = 'rgba(255,255,255,.55)'; cg.beginPath(); cg.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); cg.lineTo(Math.sin(a) * (cr - 6), -Math.cos(a) * (cr - 6)); cg.stroke(); }
      cg.font = 'bold 14px sans-serif'; cg.textAlign = 'center'; cg.textBaseline = 'middle';
      [['N', 0, '#ff6b6b'], ['E', 1, '#ddd'], ['S', 2, '#ddd'], ['W', 3, '#ddd']].forEach(([t, q, col]) => { const a = (q * Math.PI) / 2, r1 = cr - 25; cg.save(); cg.translate(Math.sin(a) * r1, -Math.cos(a) * r1); cg.rotate(-phi); cg.fillStyle = col; cg.fillText(t, 0, 0); cg.restore(); });
      const ws = Math.hypot(wind.x, wind.y);
      if (ws > 0.2) { // 바람이 「불어 가는」 쪽을 가리키는 화살표
        const a = Math.atan2(wind.y, wind.x), r0 = 33, r1 = cr - 9; // 가운데 글자를 피해 바깥 고리에 그림 (안쪽에 그리면 글자에 가려졌음)
        cg.save(); cg.rotate(a); cg.strokeStyle = cg.fillStyle = '#5cc8f0'; cg.lineWidth = 5; cg.lineCap = 'round';
        cg.beginPath(); cg.moveTo(-r1 + 2, 0); cg.lineTo(-r0, 0); cg.stroke();                       // 불어오는 쪽 꼬리
        cg.beginPath(); cg.moveTo(r0, 0); cg.lineTo(r1 - 12, 0); cg.stroke();                        // 불어 가는 쪽
        cg.beginPath(); cg.moveTo(r1 + 1, 0); cg.lineTo(r1 - 15, -10); cg.lineTo(r1 - 15, 10); cg.closePath(); cg.fill(); cg.restore();
      }
      cg.restore();
      // 가운데 글자: 풍속 + 맞바람/뒷바람/옆바람
      const head = -(wind.x * h.x + wind.y * h.z) / (Math.hypot(h.x, h.z) || 1);
      const kind = !wxOn ? '날씨 꺼짐' : ws < 0.5 ? '바람 없음' : Math.abs(head) < ws * 0.38 ? '옆바람' : head > 0 ? '맞바람' : '뒷바람';
      cg.fillStyle = 'rgba(15,23,32,.85)'; cg.beginPath(); cg.arc(cr, cr, 30, 0, Math.PI * 2); cg.fill();
      cg.fillStyle = '#fff'; cg.font = 'bold 19px sans-serif'; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText(ws.toFixed(1), cr, cr - 8);
      cg.font = '10px sans-serif'; cg.fillStyle = '#c8d2dc'; cg.fillText('m/s', cr, cr + 5);
      cg.font = 'bold 11px sans-serif'; cg.fillStyle = kind === '맞바람' ? '#ffb020' : kind === '뒷바람' ? '#3fd68a' : '#c8d2dc'; cg.fillText(kind, cr, cr + 18);
    },
  };
}
