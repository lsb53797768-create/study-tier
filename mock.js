// 체험 모드 백엔드: 서버 없이 이 기기(localStorage)에만 저장합니다.
// 서버 RPC와 같은 모양의 데이터를 돌려줘서 화면 코드는 똑같이 동작합니다.
import { store } from './store.js';
import { applyRanked, placement, classify, academic10, evaluate, ladderPos, LEVELS, problemCount, RESULT_INFO } from './rules.js';

const DB_KEY = 'st_demo_db';
const nowIso = () => new Date().toISOString();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());

const BOTS = [
  ['minjun', '민준', '2-3', 7, 0, 182], ['seoyeon', '서연', '2-3', 6, 1, 64], ['jiho', '지호', '2-1', 6, 3, 20],
  ['haeun', '하은', '2-3', 5, 2, 88], ['dohyun', '도현', '2-2', 5, 4, 41], ['yuna', '유나', '2-3', 4, 1, 73],
  ['siwoo', '시우', '2-1', 4, 3, 12], ['jiwon', '지원', '2-3', 3, 2, 55], ['eunwoo', '은우', '2-2', 3, 4, 90],
  ['subin', '수빈', '2-3', 2, 1, 33], ['hyunwoo', '현우', '2-1', 2, 3, 67], ['chaewon', '채원', '2-3', 1, 2, 8],
  ['junseo', '준서', '2-2', 1, 4, 45], ['nayeon', '나연', '2-3', 0, 2, 70], ['ace_kim', '김에이스', '2-1', 9, 0, 712],
  ['gm_park', '박고수', '2-2', 8, 0, 388],
];

function load() {
  try { return JSON.parse(store.get(DB_KEY) || 'null'); } catch { return null; }
}
function save(db) { store.set(DB_KEY, JSON.stringify(db)); }

function seedBots() {
  const users = {};
  BOTS.forEach(([username, name, group, tier, div, lp], i) => {
    const wins = 20 + ((i * 7) % 30), losses = 12 + ((i * 5) % 20);
    users[username] = {
      id: username, username, display_name: name, group_code: group, tier, div, lp,
      mmr: ladderPos(tier, div, lp) + ((i % 5) - 2) * 40, series: i === 3 ? { type: 'promo', scope: 'division', need: 2, games: 3, wins: 1, losses: 0 } : null,
      shield: 0, streak: (i % 4) - 1, wins, losses, duel_wins: i % 6, duel_losses: (i * 3) % 5, peak_pos: ladderPos(tier, div, lp) + 60,
      school: null, a10: null, show_school: false, created_at: nowIso(), last_played: new Date(Date.now() - i * 3.6e6).toISOString(),
      eval: { acc: 55 + ((i * 13) % 40), chal: 20 + ((i * 17) % 70), cons: 30 + ((i * 11) % 70), grow: 40 + ((i * 7) % 40), acad: null, total: 0, grade: 'B' },
      bot: true,
    };
    const e = users[username].eval;
    e.total = Math.round((e.acc * 30 + e.chal * 20 + e.cons * 15 + e.grow * 10) / 75);
    e.grade = e.total >= 90 ? 'S+' : e.total >= 80 ? 'S' : e.total >= 70 ? 'A' : e.total >= 60 ? 'B' : e.total >= 45 ? 'C' : 'D';
  });
  return users;
}

let db = load();
function getDb() {
  if (!db) db = { me: null, users: seedBots(), sessions: [], duels: [] };
  return db;
}
const me = () => { const d = getDb(); if (!d.me) throw new Error('SESSION_EXPIRED'); return d.users[d.me]; };

function publicProfile(p, viewerId) {
  const own = p.id === viewerId;
  const showSchool = p.show_school || own;
  const ev = p.eval ? { ...p.eval } : null;
  if (ev && !showSchool) delete ev.acad;
  return {
    username: p.username, display_name: p.display_name, group_code: p.group_code, tier: p.tier, div: p.div, lp: p.lp,
    series: p.series, shield: p.shield, streak: p.streak, wins: p.wins, losses: p.losses,
    duel_wins: p.duel_wins, duel_losses: p.duel_losses, peak_pos: p.peak_pos, eval: ev,
    school: showSchool ? p.school : null, a10: showSchool ? p.a10 : null, show_school: p.show_school,
    last_played: p.last_played, created_at: p.created_at, is_me: own,
  };
}
function sessionJson(s) {
  return { id: s.id, kind: s.kind, duel_id: s.duel_id, n: s.n, level: s.level, book: s.book, started_at: s.started_at,
    server_now: nowIso(), min_seconds: 0, max_wrong_to_win: Math.floor((LEVELS[s.level].win * s.n) / 100), status: s.status, demo: true };
}
function history(uid, lim) {
  return getDb().sessions.filter((s) => s.user_id === uid && s.status !== 'open')
    .sort((a, b) => (a.finished_at < b.finished_at ? 1 : -1)).slice(0, lim)
    .map(({ id, kind, n, wrong, level, book, result, win, lp_delta, tier_after, div_after, lp_after, events, finished_at, marks, status }) =>
      ({ id, kind, n, wrong, level, book, result, win, lp_delta, tier_after, div_after, lp_after, events, finished_at, marks, status }));
}
function refreshEval(u) {
  const S = getDb().sessions.filter((s) => s.user_id === u.id && s.status !== 'open' && (s.kind === 'ranked' || s.kind === 'placement'))
    .sort((a, b) => (a.finished_at < b.finished_at ? 1 : -1));
  u.eval = evaluate(S, u.mmr, u.a10);
  return u.eval;
}
function rankOf(u) {
  if (u.tier == null) return null;
  const pos = ladderPos(u.tier, u.div, u.lp);
  return Object.values(getDb().users).filter((q) => q.tier != null && ladderPos(q.tier, q.div, q.lp) > pos).length + 1;
}
function duelJson(d, viewer) {
  const meC = d.challenger === viewer;
  const other = getDb().users[meC ? d.opponent : d.challenger];
  const done = d.status === 'done';
  return {
    id: d.id, level: d.level, n: d.n, status: d.status, created_at: d.created_at, finished_at: d.finished_at,
    role: meC ? 'challenger' : 'opponent',
    other: { username: other.username, display_name: other.display_name, tier: other.tier, div: other.div, lp: other.lp },
    my_played: meC ? d.c_wrong != null : d.o_wrong != null,
    their_played: meC ? d.o_wrong != null : d.c_wrong != null,
    my_session: meC ? d.c_session : d.o_session,
    my_wrong: meC ? d.c_wrong : d.o_wrong, my_secs: meC ? d.c_secs : d.o_secs,
    their_wrong: done ? (meC ? d.o_wrong : d.c_wrong) : null, their_secs: done ? (meC ? d.o_secs : d.c_secs) : null,
    winner: !done ? null : d.winner == null ? 'draw' : d.winner === viewer ? 'me' : 'them',
  };
}
function botPlay(d, side) {
  const bot = getDb().users[side === 'c' ? d.challenger : d.opponent];
  const skill = Math.min(0.95, 0.35 + (bot.tier ?? 0) * 0.07);
  let wrong = 0;
  for (let i = 0; i < d.n; i++) if (Math.random() > skill) wrong++;
  d[side + '_wrong'] = wrong;
  d[side + '_secs'] = 600 + Math.floor(Math.random() * 900);
}
function settleDuel(d) {
  if (d.c_wrong == null || d.o_wrong == null) return;
  d.status = 'done'; d.finished_at = nowIso();
  d.winner = d.c_wrong < d.o_wrong ? d.challenger : d.o_wrong < d.c_wrong ? d.opponent
    : d.c_secs < d.o_secs ? d.challenger : d.o_secs < d.c_secs ? d.opponent : null;
  if (d.winner) {
    const users = getDb().users;
    users[d.winner].duel_wins++;
    users[d.winner === d.challenger ? d.opponent : d.challenger].duel_losses++;
  }
}

function finish(s, wrong, marks, book, forfeit) {
  const d = getDb();
  const u = d.users[s.user_id];
  const secs = Math.max(0, Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000));
  const before = { tier: u.tier, div: u.div, lp: u.lp, series: u.series, shield: u.shield };
  Object.assign(s, { status: forfeit ? 'forfeit' : 'done', finished_at: nowIso(), wrong, marks, book });
  let out;
  if (s.kind === 'placement') {
    const pl = placement(s.n, wrong, s.level, u.a10);
    const cls = forfeit ? 'forfeit' : classify(wrong, s.n, s.level);
    Object.assign(u, { tier: pl.tier, div: pl.div, lp: pl.lp, mmr: pl.mmr, series: null, shield: 0, streak: 0, last_played: nowIso() });
    u.peak_pos = Math.max(u.peak_pos, ladderPos(u.tier, u.div, u.lp));
    Object.assign(s, { result: cls, win: RESULT_INFO[cls].win, lp_delta: 0, tier_after: u.tier, div_after: u.div, lp_after: u.lp, mmr_after: u.mmr, events: ['placed'] });
    const ev = refreshEval(u);
    out = { kind: 'placement', result: cls, win: RESULT_INFO[cls].win, n: s.n, wrong, level: s.level, secs, lpDelta: 0, adjust: 0,
      events: ['placed'], before, after: { tier: u.tier, div: u.div, lp: u.lp, series: null, shield: 0 }, eval: ev, streak: 0 };
    // 체험용: 가상 친구가 도전장을 보냄
    const rival = Object.values(d.users).find((x) => x.bot && x.tier === u.tier) || d.users.subin;
    d.duels.push({ id: uuid(), challenger: rival.id, opponent: u.id, level: 2, n: 12, status: 'pending', created_at: nowIso() });
    botPlay(d.duels[d.duels.length - 1], 'c');
  } else if (s.kind === 'ranked') {
    const st = { tier: u.tier, div: u.div, lp: u.lp, mmr: u.mmr, series: u.series, shield: u.shield, streak: u.streak, wins: u.wins, losses: u.losses, a10: u.a10 };
    const r = applyRanked(st, s.n, wrong, s.level, forfeit);
    const { a10, ...ns } = r.state;
    Object.assign(u, ns, { last_played: nowIso() });
    u.peak_pos = Math.max(u.peak_pos, ladderPos(u.tier, u.div, u.lp));
    Object.assign(s, { result: r.result, win: r.win, lp_delta: r.lpDelta, tier_after: u.tier, div_after: u.div, lp_after: u.lp, mmr_after: u.mmr, events: r.events });
    const ev = refreshEval(u);
    out = { kind: 'ranked', result: r.result, win: r.win, n: s.n, wrong, level: s.level, secs, lpDelta: r.lpDelta, adjust: r.adjust,
      events: r.events, before, after: { tier: u.tier, div: u.div, lp: u.lp, series: u.series, shield: u.shield }, eval: ev, streak: u.streak };
  } else {
    const cls = forfeit ? 'forfeit' : classify(wrong, s.n, s.level);
    Object.assign(s, { result: cls, win: null, lp_delta: 0 });
    const du = d.duels.find((x) => x.id === s.duel_id);
    const side = du.challenger === u.id ? 'c' : 'o';
    du[side + '_wrong'] = wrong; du[side + '_secs'] = forfeit ? 999999 : secs;
    const otherId = side === 'c' ? du.opponent : du.challenger;
    if (d.users[otherId].bot && du[(side === 'c' ? 'o' : 'c') + '_wrong'] == null) { du.status = 'active'; botPlay(du, side === 'c' ? 'o' : 'c'); }
    settleDuel(du);
    out = { kind: 'duel', result: cls, n: s.n, wrong, level: s.level, secs, before, after: before, events: [], lpDelta: 0, duel: duelJson(du, u.id) };
  }
  save(d);
  return out;
}

function getMe() {
  const d = getDb(); const u = me();
  const open = d.sessions.find((s) => s.user_id === u.id && s.status === 'open');
  const alerts = d.duels.filter((x) => (x.opponent === u.id && x.status === 'pending') ||
    (x.status === 'active' && ((x.challenger === u.id && x.c_wrong == null) || (x.opponent === u.id && x.o_wrong == null)))).length;
  return { profile: publicProfile(u, u.id), open_session: open ? sessionJson(open) : null, history: history(u.id, 15), duel_alerts: alerts, rank: rankOf(u), server_now: nowIso() };
}

const err = (code) => { throw new Error(code); };
const RPC = {
  get_me: getMe,
  update_profile({ p_display_name, p_group_code }) {
    const u = me();
    const dn = (p_display_name || '').trim().slice(0, 12);
    if (!dn) err('BAD_DISPLAY_NAME');
    u.display_name = dn; u.group_code = (p_group_code || '').trim().slice(0, 20) || null;
    save(getDb()); return getMe();
  },
  set_school({ p_score, p_grade, p_sys, p_mock, p_show }) {
    const u = me();
    const sc = { sys: p_sys || 9 };
    if (p_score != null) sc.score = p_score;
    if (p_grade != null) sc.grade = p_grade;
    if (p_mock != null) sc.mock = p_mock;
    sc.updated_at = nowIso();
    u.school = sc; u.a10 = academic10(sc); u.show_school = !!p_show;
    refreshEval(u); save(getDb()); return getMe();
  },
  start_session({ p_kind, p_level, p_duel = null, p_book = null }) {
    const d = getDb(); const u = me();
    const open = d.sessions.find((s) => s.user_id === u.id && s.status === 'open');
    if (open) {
      if (open.kind === p_kind && (!p_duel || open.duel_id === p_duel)) return sessionJson(open);
      err('OPEN_SESSION_EXISTS');
    }
    let n, level = p_level;
    if (p_kind === 'placement') { if (u.tier != null) err('ALREADY_PLACED'); n = 15; }
    else if (p_kind === 'ranked') { if (u.tier == null) err('NEED_PLACEMENT'); n = problemCount(u.tier, Math.random()); }
    else {
      const du = d.duels.find((x) => x.id === p_duel);
      if (!du) err('DUEL_NOT_FOUND');
      if (!['pending', 'active'].includes(du.status)) err('DUEL_CLOSED');
      if (du.opponent === u.id && du.status !== 'active') err('DUEL_NOT_ACCEPTED');
      n = du.n; level = du.level;
    }
    const s = { id: uuid(), user_id: u.id, kind: p_kind, duel_id: p_duel, n, level, book: (p_book || '').trim().slice(0, 60) || null, started_at: nowIso(), status: 'open' };
    d.sessions.push(s);
    if (p_kind === 'duel') { const du = d.duels.find((x) => x.id === p_duel); du[du.challenger === u.id ? 'c_session' : 'o_session'] = s.id; }
    save(d); return sessionJson(s);
  },
  finish_session({ p_session, p_marks, p_book }) {
    const u = me();
    const s = getDb().sessions.find((x) => x.id === p_session && x.user_id === u.id);
    if (!s) err('SESSION_NOT_FOUND');
    if (s.status !== 'open') err('SESSION_CLOSED');
    if (!/^[OX]+$/.test(p_marks || '') || p_marks.length !== s.n) err('BAD_MARKS');
    const wrong = [...p_marks].filter((c) => c === 'X').length;
    return finish(s, wrong, p_marks, (p_book || '').trim().slice(0, 60) || s.book, false);
  },
  abandon_session({ p_session }) {
    const u = me();
    const s = getDb().sessions.find((x) => x.id === p_session && x.user_id === u.id && x.status === 'open');
    if (!s) err('SESSION_NOT_FOUND');
    return finish(s, s.n, 'X'.repeat(s.n), s.book, true);
  },
  leaderboard({ p_group = null } = {}) {
    const d = getDb();
    return Object.values(d.users).filter((u) => u.tier != null && (!p_group || u.group_code === p_group))
      .sort((a, b) => ladderPos(b.tier, b.div, b.lp) - ladderPos(a.tier, a.div, a.lp) || b.wins - a.wins)
      .slice(0, 200)
      .map((u, i) => ({ rank: i + 1, username: u.username, display_name: u.display_name, group_code: u.group_code, tier: u.tier, div: u.div, lp: u.lp,
        wins: u.wins, losses: u.losses, streak: u.streak, series_type: u.series?.type ?? null, grade: u.eval?.grade ?? null,
        last_played: u.last_played, a10: u.show_school ? u.a10 : null, is_me: u.id === d.me }));
  },
  get_profile({ p_username }) {
    const d = getDb(); const viewer = me();
    const u = d.users[(p_username || '').toLowerCase()];
    if (!u) err('USER_NOT_FOUND');
    let hist = history(u.id, 10).map(({ marks, ...h }) => h);
    if (u.bot && !hist.length) {
      hist = Array.from({ length: 6 }, (_, i) => {
        const n = 12 + (i % 4), wrong = (i * 3) % 6, level = 1 + (i % 4), result = classify(wrong, n, level);
        return { id: 'b' + i, kind: 'ranked', n, wrong, level, book: ['쎈 수학Ⅰ', '마플 시너지', '수능특강', '블랙라벨'][i % 4], result,
          win: RESULT_INFO[result].win, lp_delta: RESULT_INFO[result].win ? 19 : -16, events: [], finished_at: new Date(Date.now() - (i + 1) * 9e6).toISOString(), status: 'done' };
      });
    }
    return { profile: publicProfile(u, viewer.id), history: hist, rank: rankOf(u) };
  },
  create_duel({ p_opponent, p_level }) {
    const d = getDb(); const u = me();
    const opp = d.users[(p_opponent || '').toLowerCase()];
    if (!opp) err('USER_NOT_FOUND');
    if (opp.id === u.id) err('CANNOT_DUEL_SELF');
    if (d.duels.filter((x) => x.challenger === u.id && ['pending', 'active'].includes(x.status)).length >= 5) err('TOO_MANY_DUELS');
    const du = { id: uuid(), challenger: u.id, opponent: opp.id, level: p_level, n: 12, status: opp.bot ? 'active' : 'pending', created_at: nowIso() };
    d.duels.push(du); save(d);
    return duelJson(du, u.id);
  },
  respond_duel({ p_duel, p_accept }) {
    const d = getDb(); const u = me();
    const du = d.duels.find((x) => x.id === p_duel && x.opponent === u.id);
    if (!du) err('DUEL_NOT_FOUND');
    if (du.status !== 'pending') err('DUEL_CLOSED');
    du.status = p_accept ? 'active' : 'declined';
    save(d); return duelJson(du, u.id);
  },
  my_duels() {
    const d = getDb(); const u = me();
    return d.duels.filter((x) => x.challenger === u.id || x.opponent === u.id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 30).map((x) => duelJson(x, u.id));
  },
};

export const mock = {
  demo: true,
  isLoggedIn: () => !!getDb().me,
  async signUp({ username, display_name, group_code }) {
    const d = getDb();
    const un = (username || '').toLowerCase();
    if (!/^[a-z0-9_]{3,16}$/.test(un)) throw new Error('Database error saving new user');
    if (d.users[un]) throw new Error('USERNAME_TAKEN');
    d.users[un] = { id: un, username: un, display_name: (display_name || un).slice(0, 12), group_code: (group_code || '').trim() || null,
      tier: null, div: null, lp: 0, mmr: 0, series: null, shield: 0, streak: 0, wins: 0, losses: 0, duel_wins: 0, duel_losses: 0,
      peak_pos: -1, school: null, a10: null, show_school: false, eval: null, created_at: nowIso(), last_played: null };
    d.me = un; save(d);
  },
  async signIn() { throw new Error('체험 모드에서는 새로 시작하기만 할 수 있어요.'); },
  async signOut() { const d = getDb(); d.me = null; save(d); },
  async reset() { db = null; store.remove(DB_KEY); },
  async rpc(name, args = {}) {
    await new Promise((r) => setTimeout(r, 120)); // 서버 느낌
    if (!RPC[name]) throw new Error('UNKNOWN_RPC ' + name);
    return structuredClone(RPC[name](args));
  },
};
