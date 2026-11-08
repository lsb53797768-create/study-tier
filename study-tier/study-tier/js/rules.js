// =============================================================
//  공부 티어 규칙 엔진 (체험 모드용 JS 구현)
//  ※ 서버(supabase/schema.sql)의 PL/pgSQL 함수와 똑같은 계산을 합니다.
//    규칙을 바꾸면 두 곳을 함께 바꾸세요. (scripts/test-parity.mjs로 비교 가능)
// =============================================================

export const TIERS = [
  // color: 기본색, c2: 진한색(테두리·글자), glow: 밝은색(보석·하이라이트)
  { key: 'iron',        name: '아이언',       en: 'IRON',        color: '#7B8494', c2: '#454C59', glow: '#D3D8E0' },
  { key: 'bronze',      name: '브론즈',       en: 'BRONZE',      color: '#B86B3A', c2: '#6B3517', glow: '#F0C29E' },
  { key: 'silver',      name: '실버',         en: 'SILVER',      color: '#8E9CB0', c2: '#4E5B70', glow: '#E6EBF2' },
  { key: 'gold',        name: '골드',         en: 'GOLD',        color: '#D9A21B', c2: '#7F5900', glow: '#FBE39A' },
  { key: 'platinum',    name: '플래티넘',     en: 'PLATINUM',    color: '#169C97', c2: '#0A5754', glow: '#A8EDE7' },
  { key: 'emerald',     name: '에메랄드',     en: 'EMERALD',     color: '#1F9D5E', c2: '#0A5532', glow: '#A6EFC8' },
  { key: 'diamond',     name: '다이아몬드',   en: 'DIAMOND',     color: '#3C6EE0', c2: '#1B358F', glow: '#BFD3FF' },
  { key: 'master',      name: '마스터',       en: 'MASTER',      color: '#8A4FD6', c2: '#46198A', glow: '#DCC6FF' },
  { key: 'grandmaster', name: '그랜드마스터', en: 'GRANDMASTER', color: '#D23A52', c2: '#781024', glow: '#FFB8C3' },
  { key: 'challenger',  name: '챌린저',       en: 'CHALLENGER',  color: '#E3A31B', c2: '#2A5BBF', glow: '#FFE9A8' },
];
export const ROMAN = ['', 'I', 'II', 'III', 'IV'];

// 문제집 수준: 배수(%)와 승리 기준 오답률(%)
export const LEVELS = [
  null,
  { id: 1, name: '개념·교과서',   short: '개념', desc: '교과서, 개념서 기본 문제', mult: 85,  win: 20 },
  { id: 2, name: '유형·내신',     short: '유형', desc: '유형서, 내신 대비 문제집', mult: 100, win: 30 },
  { id: 3, name: '기출·모의고사', short: '기출', desc: '수능·모의고사 기출 문제',   mult: 110, win: 35 },
  { id: 4, name: '심화·킬러',     short: '심화', desc: '심화서, 고난도 킬러 문항',   mult: 125, win: 40 },
];

export const RULES = {
  minSecPerProblem: 30,    // 서버: 문제당 최소 30초는 지나야 제출 가능
  maxSessionHours: 3,      // 3시간 넘게 제출 안 하면 탈주(패배) 처리
  placementN: 15,
  duelN: 12,
  shieldGames: 3,          // 승급 직후 강등 보호 판 수
};

export const RESULT_INFO = {
  perfect:    { label: 'PERFECT',  ko: '퍼펙트',     win: true },
  victory:    { label: 'VICTORY',  ko: '승리',       win: true },
  close_win:  { label: 'VICTORY',  ko: '신승',       win: true },
  close_loss: { label: 'DEFEAT',   ko: '석패',       win: false },
  defeat:     { label: 'DEFEAT',   ko: '패배',       win: false },
  forfeit:    { label: 'DEFEAT',   ko: '탈주',       win: false },
};

const BASE = { perfect: 28, victory: 22, close_win: 16, close_loss: -14, defeat: -20, forfeit: -20 };

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fdiv = (a, b) => Math.floor(a / b); // 정수 바닥 나눗셈 (SQL floor(a/b::numeric)과 동일)

export const isApex = (tier) => tier >= 7;
export const floorLP = (tier) => (tier === 8 ? 300 : tier === 9 ? 600 : 0);
export const ceilLP = (tier) => (tier < 7 ? 100 : tier === 7 ? 300 : tier === 8 ? 600 : 1e9);
export const ladderPos = (tier, div, lp) => (tier == null ? -1 : tier < 7 ? tier * 400 + (4 - div) * 100 + lp : 2800 + lp);

export function tierLabel(tier, div) {
  if (tier == null) return '배치 전';
  const t = TIERS[tier];
  return tier < 7 ? `${t.name} ${ROMAN[div]}` : t.name;
}

// 티어별 기본 문제 수 (여기에 0~2개 랜덤 추가, 10~20 사이)
export const BASE_COUNT = [10, 11, 12, 13, 14, 15, 16, 18, 19, 20];
export const problemCount = (tier, r) => clamp(BASE_COUNT[tier ?? 0] + Math.floor(r * 3), 10, 20);

// ---------------- 학업 지수 (학교 성적) ----------------
// 등급 → 백분위 중간값을 점수로 환산
const G9 = [null, 98, 92.5, 83, 68.5, 50, 31.5, 17, 7.5, 2];
const G5 = [null, 95, 78, 50, 22, 5];
export function academic10(school) {
  // 반환: 학업 지수 × 10 (정수, 0~1000) 또는 null
  if (!school) return null;
  let sum = 0, w = 0;
  if (school.score != null && school.score !== '') { sum += 3 * Number(school.score); w += 3; }
  if (school.grade) { sum += 4 * (school.sys === 5 ? G5[school.grade] : G9[school.grade]); w += 4; }
  if (school.mock) { sum += 3 * G9[school.mock]; w += 3; }
  if (!w) return null;
  return Math.floor((sum * 10) / w + 0.5);
}

// ---------------- 한 판 결과 판정 ----------------
export function classify(wrong, n, level) {
  const W = LEVELS[level].win;
  const x = wrong * 100;
  if (wrong === 0) return 'perfect';
  if (x <= (W - 10) * n) return 'victory';
  if (x <= W * n) return 'close_win';
  if (x <= (W + 15) * n) return 'close_loss';
  return 'defeat';
}
// 승리하려면 오답이 몇 개 이하여야 하는지
export const maxWrongToWin = (n, level) => Math.floor((LEVELS[level].win * n) / 100);

// ---------------- 배치고사 ----------------
export function placement(n, wrong, level, a10) {
  const base = fdiv(1400 * (n - wrong), n) + (level - 1) * 200;
  let pos = a10 == null ? base : fdiv(7 * base + 3 * (a10 * 2), 10);
  pos = clamp(pos, 0, 1699); // 배치 최고: 플래티넘 IV
  const tier = fdiv(pos, 400);
  return { tier, div: 4 - fdiv(pos % 400, 100), lp: pos % 100, mmr: pos };
}

// ---------------- 랭크 한 판 적용 ----------------
// st: { tier, div, lp, mmr, series, shield, streak, wins, losses, a10 }
// 반환: { state, result, win, lpDelta, adjust, events }
export function applyRanked(st0, n, wrong, level, forfeit = false) {
  const st = { ...st0, series: st0.series ? { ...st0.series } : null };
  const result = forfeit ? 'forfeit' : classify(wrong, n, level);
  const win = RESULT_INFO[result].win;
  const L = ladderPos(st.tier, st.div, st.lp);
  const W = LEVELS[level].win;

  // 숨은 MMR 갱신 (실력 추정치)
  const p = L + fdiv(12 * (W * n - 100 * wrong), n) + (level - 2) * 150;
  st.mmr = clamp(st.mmr + fdiv(3 * (p - st.mmr), 10), 0, 4000);

  // MMR + 학업 지수 → LP 보정 (-8 ~ +8)
  const m10 = st.a10 == null ? 10 * st.mmr : 8 * st.mmr + 6 * st.a10;
  const adjust = clamp(fdiv(m10 - 10 * L + 250, 500), -8, 8);

  st.streak = win ? (st.streak > 0 ? st.streak + 1 : 1) : (st.streak < 0 ? st.streak - 1 : -1);
  if (win) st.wins++; else st.losses++;

  const mult = LEVELS[level].mult;
  let delta;
  if (win) {
    delta = fdiv(BASE[result] * mult + 50, 100) + adjust + (st.streak >= 3 ? 3 : 0);
    delta = Math.max(delta, 8);
  } else {
    // 탈주는 문제집 수준과 상관없이 무거운 벌점 (수준을 바꿔 벌점을 줄이는 꼼수 방지)
    delta = fdiv(BASE[result] * (result === 'forfeit' ? 125 : 200 - mult) + 50, 100) + adjust;
    delta = Math.min(delta, -6);
  }

  const events = [];
  const lpBefore = st.lp;
  let promotedNow = false;
  const fl = floorLP(st.tier), ce = ceilLP(st.tier);

  if (st.series) {
    const s = st.series;
    if (win) s.wins++; else s.losses++;
    const lossLimit = s.games - s.need + 1;
    if (s.type === 'promo') {
      if (s.wins >= s.need) { promote(st); promotedNow = true; events.push('promoted'); }
      else if (s.losses >= lossLimit) { st.series = null; st.lp = ce - 30; events.push('promo_failed'); }
      else events.push('promo_progress');
    } else {
      if (s.wins >= s.need) { st.series = null; st.lp = fl + 25; events.push('demote_survived'); }
      else if (s.losses >= lossLimit) { demote(st); events.push('demoted'); }
      else events.push('demote_progress');
    }
  } else if (win) {
    st.lp += delta;
    if (st.lp >= ce) {
      st.lp = ce;
      const division = st.tier < 7 && st.div > 1;
      st.series = { type: 'promo', scope: division ? 'division' : 'tier', need: division ? 2 : 3, games: division ? 3 : 5, wins: 0, losses: 0 };
      events.push('promo_start');
    }
  } else {
    const canDemote = !(st.tier === 0 && st.div === 4);
    if (st.lp <= fl && canDemote && st.shield === 0) {
      st.series = { type: 'demote', scope: 'demote', need: 2, games: 3, wins: 0, losses: 0 };
      events.push('demote_start');
    } else {
      if (st.lp <= fl && st.shield > 0) events.push('shield_used');
      st.lp = Math.max(fl, st.lp + delta);
    }
  }
  if (!promotedNow && st.shield > 0) st.shield--;

  const sameTier = st.tier === st0.tier && st.div === st0.div;
  return { state: st, result, win, lpDelta: sameTier ? st.lp - lpBefore : delta, adjust, events };
}

function promote(st) {
  if (st.tier < 7) {
    if (st.div > 1) { st.div--; st.lp = 0; }
    else { st.tier++; st.div = st.tier < 7 ? 4 : 0; st.lp = 0; }
  } else {
    st.tier++; st.lp = floorLP(st.tier);
  }
  st.series = null;
  st.shield = RULES.shieldGames;
}
function demote(st) {
  st.series = null;
  if (st.tier < 7) {
    if (st.div < 4) st.div++;
    else { st.tier--; st.div = 1; }
    st.lp = 75;
  } else if (st.tier === 7) {
    st.tier = 6; st.div = 1; st.lp = 75;
  } else {
    st.tier--; st.lp = ceilLP(st.tier) - 30;
  }
}

// ---------------- 정성평가 ----------------
// sessions: 최근 랭크/배치 기록(최신순) [{n, wrong, level, mmr_after, finished_at}]
export function evaluate(sessions, mmr, a10, now = Date.now()) {
  const S = sessions.slice(0, 10);
  if (!S.length) return null;
  const acc = Math.round(S.reduce((s, x) => s + (x.n - x.wrong) / x.n, 0) / S.length * 100);
  const chal = Math.round(S.reduce((s, x) => s + (x.level - 1) / 3, 0) / S.length * 100);
  const days = new Set(
    sessions.filter((x) => now - new Date(x.finished_at).getTime() < 14 * 864e5)
      .map((x) => new Date(new Date(x.finished_at).getTime() + 9 * 36e5).toISOString().slice(0, 10)),
  ).size;
  const cons = Math.min(100, days * 10);
  const oldest = S[S.length - 1].mmr_after ?? mmr;
  const grow = S.length < 2 ? 50 : clamp(Math.round(50 + (mmr - oldest) / 6), 0, 100);
  const acad = a10 == null ? null : Math.round(a10 / 10);
  const total = acad == null
    ? Math.round((acc * 30 + chal * 20 + cons * 15 + grow * 10) / 75)
    : Math.round((acc * 30 + chal * 20 + cons * 15 + grow * 10 + acad * 25) / 100);
  return { acc, chal, cons, grow, acad, total, grade: gradeOf(total) };
}
export const gradeOf = (t) => (t >= 90 ? 'S+' : t >= 80 ? 'S' : t >= 70 ? 'A' : t >= 60 ? 'B' : t >= 45 ? 'C' : 'D');

// 정성평가 코멘트 (화면 표시용)
export function evalComment(ev, name = '당신') {
  if (!ev) return '아직 기록이 없어요. 첫 판을 시작해 보세요!';
  const parts = [];
  const axes = [['정확도', ev.acc], ['도전 정신', ev.chal], ['꾸준함', ev.cons], ['성장세', ev.grow]];
  if (ev.acad != null) axes.push(['학교 성적', ev.acad]);
  const best = [...axes].sort((a, b) => b[1] - a[1])[0];
  const worst = [...axes].sort((a, b) => a[1] - b[1])[0];
  parts.push(`${name}의 가장 큰 무기는 ${best[0]}(${best[1]}점)입니다.`);
  if (ev.acc >= 85 && ev.chal < 40) parts.push('정확도가 높으니 한 단계 어려운 문제집에 도전하면 LP를 더 빨리 올릴 수 있어요.');
  else if (ev.chal >= 70 && ev.acc < 60) parts.push('어려운 문제에 과감히 도전하는 중이에요. 오답 정리로 정확도를 끌어올리면 승급이 빨라집니다.');
  if (ev.cons < 40) parts.push('최근 2주간 공부한 날이 적어요. 하루 한 판이라도 꾸준히 하면 평가가 크게 오릅니다.');
  else if (ev.cons >= 80) parts.push('거의 매일 공부하고 있어요. 꾸준함은 최고의 재능입니다.');
  if (ev.grow >= 65) parts.push('최근 실력이 눈에 띄게 오르고 있어요!');
  else if (ev.grow <= 35) parts.push('최근 흐름이 주춤해요. 쉬운 단계로 감각을 되찾아도 좋아요.');
  if (ev.acad != null && ev.acad >= 80 && ev.acc < 70) parts.push('학교 성적에 비해 문제 풀이 결과가 아쉬워요. 실전 감각을 더 키워 보세요.');
  if (worst[1] < 50 && worst[0] !== best[0]) parts.push(`보완할 점: ${worst[0]}(${worst[1]}점).`);
  return parts.join(' ');
}
