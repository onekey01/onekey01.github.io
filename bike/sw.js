// 무무 라이딩 오프라인 저장: 화면 파일은 인터넷이 있으면 새로 받고, 없으면 저장본을 씀
const CACHE = 'bike-v12';
const FILES = ['./', './index.html', './app.js', './tex/asphalt_02.jpg', './tex/leafy_grass.jpg', './tex/aerial_grass_rock.jpg', './tex/rocky_terrain_02.jpg', './tex/coast_sand_01.jpg', './tex/snow_02.jpg', './sky/cloudy.jpg', './sky/clear.jpg', './sky/cloudy_1k.hdr', './sky/clear_1k.hdr', './sky/overcast.jpg', './sky/overcast_1k.hdr', './tree/broad_a_a.webp', './tree/broad_a_n.webp', './tree/broad_b_a.webp', './tree/broad_b_n.webp', './tree/fir_a_a.webp', './tree/fir_a_n.webp', './tree/fir_b_a.webp', './tree/fir_b_n.webp', './tree/fir_c_a.webp', './tree/fir_c_n.webp', './tree/shrub_b_a.webp', './tree/shrub_b_n.webp', './tree/shrub_c_a.webp', './tree/shrub_c_n.webp', './rock/rock_07.glb', './rock/rock_07_diff.jpg', './rock/rock_07_nor_gl.jpg', './rock/rock_09.glb', './rock/rock_09_diff.jpg', './rock/rock_09_nor_gl.jpg', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))
  );
});
