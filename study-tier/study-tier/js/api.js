// 서버 통신 계층: Supabase REST API를 직접 호출합니다 (라이브러리 불필요).
// 설정이 비어 있으면 체험용 로컬 백엔드(mock.js)를 씁니다.
import { store } from './store.js';
import { CONFIG } from './config.js';
import { mock } from './mock.js';

export const DEMO = !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY;

const AUTH_KEY = 'st_auth';
const base = (CONFIG.SUPABASE_URL || '').replace(/\/+$/, '');
let auth = null;
try { auth = JSON.parse(store.get(AUTH_KEY) || 'null'); } catch { auth = null; }

function saveAuth(d) {
  auth = d ? { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 } : null;
  try {
    if (auth) store.set(AUTH_KEY, JSON.stringify(auth));
    else store.remove(AUTH_KEY);
  } catch { /* 저장소 사용 불가 */ }
}

async function req(path, body, withAuth = true) {
  const headers = { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_KEY };
  if (withAuth && auth?.access_token) headers.Authorization = 'Bearer ' + auth.access_token;
  let res;
  try {
    res = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  } catch {
    const e = new Error('NETWORK'); e.status = 0; throw e;
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const e = new Error(data?.message || data?.msg || data?.error_description || data?.error || res.statusText || 'ERROR');
    e.status = res.status; e.code = data?.code || data?.error_code;
    throw e;
  }
  return data;
}

async function refresh() {
  const d = await req('/auth/v1/token?grant_type=refresh_token', { refresh_token: auth.refresh_token }, false);
  saveAuth(d);
}

const remote = {
  isLoggedIn: () => !!auth,
  async signUp({ email, password, username, display_name, group_code }) {
    const free = await req('/rest/v1/rpc/username_available', { p_username: username }, false);
    if (!free) throw new Error('USERNAME_TAKEN');
    const d = await req('/auth/v1/signup', { email, password, data: { username, display_name, group_code } }, false);
    if (!d?.access_token) throw new Error('EMAIL_CONFIRM_ON');
    saveAuth(d);
  },
  async signIn({ email, password }) {
    const d = await req('/auth/v1/token?grant_type=password', { email, password }, false);
    saveAuth(d);
  },
  async signOut() {
    try { await req('/auth/v1/logout', {}); } catch { /* 무시 */ }
    saveAuth(null);
  },
  async rpc(name, args = {}) {
    if (auth && auth.expires_at - Date.now() < 60_000) {
      try { await refresh(); } catch { saveAuth(null); throw Object.assign(new Error('SESSION_EXPIRED'), { status: 401 }); }
    }
    try {
      return await req('/rest/v1/rpc/' + name, args);
    } catch (e) {
      if (e.status === 401 && auth?.refresh_token) {
        try { await refresh(); } catch { saveAuth(null); throw Object.assign(new Error('SESSION_EXPIRED'), { status: 401 }); }
        return req('/rest/v1/rpc/' + name, args);
      }
      throw e;
    }
  },
};

export const api = DEMO ? mock : remote;

// 서버 오류 → 한국어 안내
export function errorText(e) {
  const m = String(e?.message || e);
  if (m.startsWith('TOO_FAST')) return `아직 제출할 수 없어요. ${m.split(':')[1]}초 더 풀어야 합니다.`;
  const map = {
    NETWORK: '서버에 연결할 수 없어요. 인터넷 연결을 확인하세요. (서버가 1주일 넘게 쉬었다면 Supabase에서 프로젝트를 다시 켜야 합니다.)',
    USERNAME_TAKEN: '이미 사용 중인 아이디예요. 다른 아이디를 입력하세요.',
    EMAIL_CONFIRM_ON: '가입은 됐지만 이메일 인증이 켜져 있어요. 관리자가 Supabase에서 "Confirm email"을 꺼야 바로 로그인할 수 있어요.',
    SESSION_EXPIRED: '로그인이 만료됐어요. 다시 로그인하세요.',
    'Invalid login credentials': '이메일 또는 비밀번호가 맞지 않아요.',
    'User already registered': '이미 가입된 이메일이에요. 로그인하세요.',
    'Database error saving new user': '가입에 실패했어요. 아이디는 영어 소문자·숫자·_ 3~16자여야 해요.',
    OPEN_SESSION_EXISTS: '진행 중인 다른 판이 있어요. 먼저 끝내거나 포기하세요.',
    NEED_PLACEMENT: '먼저 배치고사를 치러야 해요.',
    ALREADY_PLACED: '이미 배치가 끝났어요.',
    DUEL_NOT_FOUND: '대결을 찾을 수 없어요.',
    DUEL_CLOSED: '이미 끝났거나 만료된 대결이에요.',
    DUEL_NOT_ACCEPTED: '먼저 도전을 수락하세요.',
    DUEL_ALREADY_PLAYED: '이미 이 대결을 플레이했어요.',
    CANNOT_DUEL_SELF: '자기 자신에게는 도전할 수 없어요.',
    TOO_MANY_DUELS: '진행 중인 도전이 너무 많아요(최대 5개).',
    USER_NOT_FOUND: '해당 아이디의 학생을 찾을 수 없어요.',
    SESSION_CLOSED: '이미 끝난 판이에요.',
    BAD_MARKS: '모든 문제의 채점(O/X)을 입력하세요.',
  };
  for (const k of Object.keys(map)) if (m.includes(k)) return map[k];
  if (/password/i.test(m) && /6/.test(m)) return '비밀번호는 6자 이상이어야 해요.';
  if (/email/i.test(m) && /invalid/i.test(m)) return '이메일 주소 형식을 확인하세요.';
  return '문제가 생겼어요: ' + m;
}
