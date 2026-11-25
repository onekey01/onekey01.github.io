// 구글 로그인 + 기록 함께 쓰기 (Firebase). PC·태블릿에서 같은 계정이면 레벨·보상·기록이 같아짐
// 저장 구조: users/{uid} = 레벨·보상·최고기록·꾸미기,  users/{uid}/rides/{id} = 운동 기록 한 건씩
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { FIREBASE } from './firebaseConfig.js';

let app, auth, db, user = null, pushTimer = null;

/**
 * hooks: getLocal() → { prof, cfg, history }  지금 이 기기의 자료
 *        applyMerged({ prof, cfg, history })     합친 결과를 이 기기에 반영
 *        onStatus(text, state)                    화면 표시
 */
export function initCloud(hooks) {
  try {
    app = initializeApp(FIREBASE);
    auth = getAuth(app);
    db = initializeFirestore(app, { localCache: persistentLocalCache() }); // 인터넷이 끊겨도 저장해 두었다가 다시 연결되면 올림
  } catch (e) { hooks.onStatus('로그인 기능을 불러오지 못했어요', ''); return null; }
  getRedirectResult(auth).catch(() => {});
  onAuthStateChanged(auth, async (u) => {
    user = u;
    if (!u) { hooks.onStatus('로그인하면 PC·태블릿 기록이 합쳐져요', ''); hooks.onUser(null); return; }
    hooks.onUser(u);
    hooks.onStatus('기록 맞추는 중…', 'wait');
    try { await sync(hooks); hooks.onStatus('☁️ 기록이 PC·태블릿과 맞춰졌어요', 'on'); }
    catch (e) { hooks.onStatus('기록 맞추기 실패 — 인터넷을 확인해 주세요', ''); console.warn('[sync]', e); }
  });
  return {
    async login() {
      const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      try { await signInWithPopup(auth, p); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, p);
        else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') throw e;
      }
    },
    logout: () => signOut(auth),
    get user() { return user; },
    removeRide(id) { if (user) deleteDoc(doc(db, 'users', user.uid, 'rides', String(id))).catch((e) => console.warn('[del]', e)); },
    /** 기기에서 바뀐 내용을 올림 (잦은 저장을 3초 단위로 묶음) */
    push(local, newRide) {
      if (!user) return;
      if (newRide) setDoc(doc(db, 'users', user.uid, 'rides', String(newRide.id)), newRide).catch((e) => console.warn('[push ride]', e));
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => setDoc(doc(db, 'users', user.uid), profileDoc(local), { merge: true }).catch((e) => console.warn('[push]', e)), 3000);
    },
  };
}

const LOOK = ['jersey', 'bike', 'weight', 'ratio', 'quality'];
const profileDoc = (local) => ({ xp: local.prof.xp, best: local.prof.best, done: local.prof.done, look: Object.fromEntries(LOOK.map((k) => [k, local.cfg[k]])), updatedAt: serverTimestamp() });

/** 이 기기 자료와 계정 자료를 합침: 경험치는 큰 쪽, 최고 기록은 빠른 쪽, 완주 표시는 둘 다, 운동 기록은 합집합 */
async function sync(hooks) {
  const local = hooks.getLocal();
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const remote = snap.exists() ? snap.data() : null;
  const prof = { ...local.prof };
  const cfg = { ...local.cfg };
  if (remote) {
    prof.xp = Math.max(local.prof.xp || 0, remote.xp || 0);
    prof.best = { ...(remote.best || {}) };
    for (const [k, v] of Object.entries(local.prof.best || {})) if (!prof.best[k] || v < prof.best[k]) prof.best[k] = v;
    prof.done = { ...(remote.done || {}), ...(local.prof.done || {}) };
    if (remote.look) for (const k of LOOK) if (remote.look[k] !== undefined) cfg[k] = remote.look[k]; // 꾸미기·몸무게는 계정 쪽을 따름
  }
  // 운동 기록 합치기
  const rs = await getDocs(collection(db, 'users', user.uid, 'rides'));
  const byId = new Map();
  rs.forEach((d) => byId.set(String(d.id), d.data()));
  const toUpload = local.history.filter((r) => !byId.has(String(r.id)));
  for (const r of local.history) byId.set(String(r.id), r);
  const history = [...byId.values()].sort((a, b) => b.start - a.start);
  if (toUpload.length) {
    for (let i = 0; i < toUpload.length; i += 400) {
      const b = writeBatch(db);
      toUpload.slice(i, i + 400).forEach((r) => b.set(doc(db, 'users', user.uid, 'rides', String(r.id)), r));
      await b.commit();
    }
  }
  await setDoc(ref, profileDoc({ prof, cfg }), { merge: true });
  hooks.applyMerged({ prof, cfg, history });
}
