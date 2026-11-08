// localStorage 안전 래퍼: 저장소가 막힌 환경(사생활 보호 모드 등)에서도 앱이 멈추지 않게 메모리로 대체
const mem = new Map();
let ok = true;
try { const k = '__st_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); } catch { ok = false; }

export const store = {
  get(k) { try { return ok ? localStorage.getItem(k) : mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } },
  set(k, v) { try { if (ok) localStorage.setItem(k, v); else mem.set(k, String(v)); } catch { mem.set(k, String(v)); } },
  remove(k) { try { if (ok) localStorage.removeItem(k); } catch { /* 무시 */ } mem.delete(k); },
};
