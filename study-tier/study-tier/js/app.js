// =============================================================
//  공부 티어 — 화면과 연출 (한눈학사 디자인 언어)
// =============================================================
import { store } from './store.js';
import { api, DEMO, errorText } from './api.js';
import { TIERS, ROMAN, LEVELS, RULES, RESULT_INFO, tierLabel, ceilLP, floorLP, evalComment, BASE_COUNT } from './rules.js';
import { emblemSVG } from './emblems.js';
import * as fx from './fx.js';

const app = document.getElementById('app');
const layer = document.getElementById('layer');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = fx.sleep;

const S = { me: null, tab: 'home', boardScope: 'all', play: null, timer: 0, offset: 0, level: Number(store.get('st_level')) || 2 };
const LEVEL_COLOR = [null, 'var(--green)', 'var(--blue)', 'var(--orange)', 'var(--purple)'];

// ---------------- 공통 도우미 ----------------
function applyThemeMode() {
  const m = store.get('st_theme') || 'auto';
  if (m === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', m);
}
function setTheme(tier) {
  const t = tier == null ? { color: '#85918C', c2: '#4F5C57', glow: '#E3E8E5' } : TIERS[tier];
  const r = document.documentElement.style;
  r.setProperty('--t', t.color); r.setProperty('--t2', t.c2); r.setProperty('--tg', t.glow);
}
const tierColor = (tier) => (tier == null ? '#85918C' : TIERS[tier].color);
function toast(msg, bad = false) {
  $$('.toast').forEach((t) => t.remove());
  const d = document.createElement('div');
  d.className = 'toast' + (bad ? ' bad' : '');
  d.setAttribute('role', 'status');
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 4200);
}
async function run(fn, btn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (e) {
    console.error(e);
    if (e?.status === 401 || /SESSION_EXPIRED/.test(e?.message)) { await api.signOut(); renderAuth(); }
    toast(errorText(e), true);
    return undefined;
  } finally { if (btn) btn.disabled = false; }
}
const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0');
};
const ago = (iso) => {
  if (!iso) return '기록 없음';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금'; if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
};
const today = () => new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
const winRate = (w, l) => (w + l ? Math.round((w / (w + l)) * 100) : 0);
const tierSpan = (t, d) => (t == null ? '배치 전' : esc(tierLabel(t, d)));
function lpRange(tier) { const lo = floorLP(tier), hi = ceilLP(tier); return { lo, hi: hi > 1e8 ? null : hi }; }
function lpPct(tier, lp) {
  const { lo, hi } = lpRange(tier);
  if (hi == null) return 100;
  return Math.max(0, Math.min(100, ((lp - lo) / (hi - lo)) * 100));
}
function countUp(el, from, to, ms = 900, tick) {
  return new Promise((res) => {
    const t0 = performance.now(); let last = from;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (v !== last) { last = v; tick?.(v); }
      el.textContent = v;
      if (k < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}

const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  rank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 16v5M7 3h10v6a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
  duel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14L3 3v3l9 9M10 14L21 3v3l-9 9M5 16l3 3M4 20l2-2M19 16l-3 3M20 20l-2-2"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor"/></svg>',
};

// ---------------- 시트(모달) ----------------
function openSheet(html, { label = '창' } = {}) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div>`;
  layer.appendChild(bg);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { bg.remove(); removeEventListener('keydown', onKey); };
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  addEventListener('keydown', onKey);
  setTimeout(() => $('input, button.level, button', bg.firstChild)?.focus(), 50);
  return { el: bg.firstChild, close };
}
function confirmSheet(title, body, okText, danger = false) {
  return new Promise((res) => {
    const { el, close } = openSheet(`<h2>${esc(title)}</h2><p class="muted" style="margin:0">${body}</p>
      <div class="sheet-foot"><button class="btn" data-a="no">취소</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-a="ok">${esc(okText)}</button></div>`, { label: title });
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a) { close(); res(a === 'ok'); }
    });
  });
}

// ---------------- 시작 ----------------
async function boot() {
  applyThemeMode();
  if (!fx.settings.motion) document.body.classList.add('no-motion');
  setTheme(null);
  if (!api.isLoggedIn()) return renderAuth();
  const ok = await loadMe();
  if (ok) render();
}
async function loadMe() {
  try {
    const t0 = Date.now();
    S.me = await api.rpc('get_me');
    S.offset = new Date(S.me.server_now).getTime() - (t0 + Date.now()) / 2;
    setTheme(S.me.profile.tier);
    return true;
  } catch (e) {
    if (e?.status === 401 || /SESSION_EXPIRED|PROFILE_NOT_FOUND|JWT|NOT_AUTHENTICATED/.test(e?.message)) {
      await api.signOut(); renderAuth(); return false;
    }
    app.innerHTML = `<div class="login"><div class="login-inner" style="grid-template-columns:1fr;max-width:520px"><div class="login-card">
      <h2 style="font-family:var(--f-display);font-weight:400;font-size:28px">연결 오류</h2><p class="muted" style="margin:0">${esc(errorText(e))}</p>
      <button class="btn primary" id="retry">다시 시도</button></div></div></div>`;
    $('#retry').onclick = boot;
    return false;
  }
}

// ---------------- 첫 화면 (가입/로그인) ----------------
function renderAuth(mode = 'login') {
  fx.setAmbient(null);
  setTheme(null);
  const ladder = TIERS.map((t, i) => `<div>${emblemSVG(i, { size: 64 })}${t.name}</div>`).join('');
  const legend = LEVELS.slice(1).map((L, i) => `<span><i style="background:${LEVEL_COLOR[i + 1]}"></i>${L.short}</span>`).join('');
  let form;
  if (DEMO) {
    form = `<form class="lform" id="authForm">
      <label for="f-un">아이디</label><input id="f-un" name="username" required pattern="[a-z0-9_]{3,16}" autocomplete="username" autocapitalize="none" placeholder="예: math_king">
      <p class="hint">영어 소문자, 숫자, _ 3~16자</p>
      <label for="f-dn">닉네임</label><input id="f-dn" name="display_name" required maxlength="12" placeholder="예: 수학왕">
      <label for="f-gc">반 코드 (선택)</label><input id="f-gc" name="group_code" maxlength="20" placeholder="예: 2-3" value="2-3">
      <p class="hint">같은 코드끼리 반 랭킹을 볼 수 있어요</p>
      <button class="btn primary" type="submit">체험 시작하기</button>
    </form>
    <p class="who-note"><i></i>체험 모드예요. 기록은 이 기기에만 저장되고 가상 친구 16명과 경쟁합니다.</p>`;
  } else {
    const signup = mode === 'signup';
    form = `<div class="tabs" role="tablist">
        <button type="button" class="tab" role="tab" aria-selected="${!signup}" data-mode="login">로그인</button>
        <button type="button" class="tab" role="tab" aria-selected="${signup}" data-mode="signup">가입하기</button>
      </div>
      <form class="lform" id="authForm">
      <label for="f-em">이메일</label><input id="f-em" type="email" name="email" required autocomplete="email" autocapitalize="none">
      <label for="f-pw">비밀번호</label><input id="f-pw" type="password" name="password" required minlength="6" autocomplete="${signup ? 'new-password' : 'current-password'}">
      ${signup ? `<p class="hint">6자 이상</p>
      <label for="f-un">아이디</label><input id="f-un" name="username" required pattern="[a-z0-9_]{3,16}" autocapitalize="none" placeholder="예: math_king">
      <p class="hint">영어 소문자, 숫자, _ 3~16자. 친구가 대결을 신청할 때 써요</p>
      <label for="f-dn">닉네임</label><input id="f-dn" name="display_name" required maxlength="12" placeholder="예: 수학왕">
      <label for="f-gc">반 코드 (선택)</label><input id="f-gc" name="group_code" maxlength="20" placeholder="예: 2-3">` : ''}
      <button class="btn primary" type="submit">${signup ? '가입하고 시작하기' : '로그인'}</button>
    </form>`;
  }
  app.innerHTML = `<div class="login"><div class="login-inner">
    <div class="brand">
      <p class="eyebrow">수학 랭크 게임 · 아이언부터 챌린저까지</p>
      <h1>공부<span>티어</span></h1>
      <p class="lead">내 문제집으로 풀고, 채점하고, 티어를 올려요.</p>
      <div class="legend">${legend}</div>
      <div class="ladder-card"><div class="lc-head"><b>티어</b><span>10단계</span></div><div class="ladder-grid">${ladder}</div></div>
    </div>
    <div class="login-card">${form}</div>
  </div></div>`;
  $$('[data-mode]').forEach((b) => (b.onclick = () => renderAuth(b.dataset.mode)));
  $('#authForm').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.username) f.username = f.username.trim().toLowerCase();
    const btn = $('button[type=submit]', e.target);
    run(async () => {
      if (DEMO || mode === 'signup') await api.signUp(f);
      else await api.signIn(f);
      fx.sfx.series();
      const ok = await loadMe();
      if (ok) { S.tab = 'home'; render(); }
    }, btn);
  };
}

// ---------------- 껍데기 (레일 + 본문) ----------------
function render() {
  if (S.play) return renderPlay();
  const p = S.me.profile;
  const alerts = S.me.duel_alerts || 0;
  const btn = (k, label, inner, cls) => `<button class="rail-btn ${cls}" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}><span class="dot">${inner}</span><small>${label}</small>${k === 'duel' && alerts ? `<span class="badge">${alerts}</span>` : ''}</button>`;
  app.innerHTML = `<div class="shell">
    <nav class="rail" aria-label="주 메뉴">
      <div class="rail-brand">공부<br>티어</div>
      ${btn('home', '홈', ICON.home, 'rb-home')}
      ${btn('rank', '랭킹', ICON.rank, 'rb-rank')}
      ${btn('duel', '대결', ICON.duel, 'rb-duel')}
      <div class="rail-spacer"></div>
      ${btn('me', '내 정보', esc((p.display_name || '?').slice(0, 1)), 'rb-me')}
    </nav>
    <main class="main">
      <div class="banner">${DEMO ? '<p>체험 모드예요. 기록은 이 기기에만 저장되고, 가상 친구 16명과 경쟁합니다. 친구들과 진짜로 겨루려면 README의 서버 연결 방법을 따라 주세요.</p>' : ''}</div>
      <div class="view" id="screen"></div>
    </main></div>`;
  $$('.rail [data-tab]').forEach((b) => (b.onclick = () => { fx.sfx.tap(); S.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));
  fx.setAmbient(null);
  ({ home: renderHome, rank: renderRank, duel: renderDuels, me: renderMe })[S.tab]($('#screen'));
}

// ---------------- 홈 ----------------
function lpBlock(p) {
  const { hi } = lpRange(p.tier);
  const next = p.tier >= 7 && p.tier < 9 ? `다음 ${TIERS[p.tier + 1].name}까지 ${hi - p.lp} LP` : p.tier === 9 ? '정상에 섰습니다' : '100 LP에서 승급전';
  return `<div class="lp"><div class="lp-head"><span><b id="lpNum">${p.lp}</b> LP</span><span>${next}</span></div>
    <div class="lp-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(lpPct(p.tier, p.lp))}"><div class="lp-fill" id="lpFill" style="width:${lpPct(p.tier, p.lp)}%"></div></div></div>`;
}
function seriesBlock(s) {
  if (!s) return '';
  const label = s.type === 'promo'
    ? (s.scope === 'division' ? `승급전 (${s.games}판 ${s.need}선승)` : `티어 승급전 (${s.games}판 ${s.need}선승)`)
    : '강등전 (3판 2선승, 2패하면 강등)';
  const pips = [];
  for (let i = 0; i < s.wins; i++) pips.push('<span class="pip w">✓</span>');
  for (let i = 0; i < s.losses; i++) pips.push('<span class="pip l">✕</span>');
  while (pips.length < s.games) pips.push('<span class="pip"></span>');
  return `<div class="series" id="series"><span class="series-label ${s.type}">${label}</span>${pips.join('')}</div>`;
}
function radarSVG(ev) {
  const axes = [['정확도', ev.acc], ['도전', ev.chal], ['꾸준함', ev.cons], ['성장', ev.grow]];
  if (ev.acad != null) axes.push(['학교 성적', ev.acad]);
  const n = axes.length, cx = 120, cy = 112, R = 76;
  const pt = (i, r) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const poly = (r) => axes.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(',')).join(' ');
  const data = axes.map(([, v], i) => pt(i, (R * Math.max(4, v)) / 100).map((x) => x.toFixed(1)).join(',')).join(' ');
  const labels = axes.map(([l], i) => { const [x, y] = pt(i, R + 20); return `<text x="${x.toFixed(0)}" y="${(y + 4).toFixed(0)}" text-anchor="middle">${l}</text>`; }).join('');
  return `<svg class="radar" viewBox="0 0 240 228" role="img" aria-label="정성평가 그래프">
    ${[1, 0.66, 0.33].map((k) => `<polygon class="grid" points="${poly(R * k)}"/>`).join('')}
    ${axes.map((_, i) => { const [x, y] = pt(i, R); return `<line class="grid" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('')}
    <polygon class="area" points="${data}"/>${labels}</svg>`;
}
function evalBlock(ev, name, own = true) {
  if (!ev) return `<div class="empty">${own ? '첫 판을 마치면 정성평가가 나와요.' : '아직 평가 기록이 없어요.'}</div>`;
  const axes = [['정확도', ev.acc], ['도전', ev.chal], ['꾸준함', ev.cons], ['성장', ev.grow]];
  if (ev.acad != null) axes.push(['학교 성적', ev.acad]);
  return `<div class="card eval">
    <div class="grade-tile"><b>${esc(ev.grade)}</b><small>종합 ${ev.total}점</small></div>
    <p class="eval-text">${esc(evalComment(ev, name))}</p>
    ${radarSVG(ev)}
    <div class="axes">${axes.map(([l, v]) => `<div class="axis">${l}<b>${v}</b></div>`).join('')}</div></div>`;
}
function matchRow(h) {
  if (h.kind === 'placement') {
    return `<li class="row"><span class="row-tile perfect"><b>배치</b><small>완료</small></span>
      <span class="row-main"><span class="row-title">${tierSpan(h.tier_after, h.div_after)} 배치</span><span class="row-sub">${h.n - h.wrong}/${h.n} 정답, ${LEVELS[h.level].short}</span></span>
      <span class="row-side"><span class="chip">${ago(h.finished_at)}</span></span></li>`;
  }
  const info = RESULT_INFO[h.result] || RESULT_INFO.defeat;
  const cls = h.kind === 'duel' ? '' : h.result === 'perfect' ? 'perfect' : info.win ? 'win' : 'loss';
  const tile = h.kind === 'duel' ? '<b>대결</b><small>기록</small>' : `<b>${h.lp_delta > 0 ? '+' : ''}${h.lp_delta ?? 0}</b><small>LP</small>`;
  const ev = (h.events || []).includes('promoted') ? '<span class="chip gold">승급</span>' : (h.events || []).includes('demoted') ? '<span class="chip bad">강등</span>' : '';
  return `<li class="row"><span class="row-tile ${cls}">${tile}</span>
    <span class="row-main"><span class="row-title">${h.kind === 'duel' ? '대결' : info.ko} ${ev}</span>
      <span class="row-sub">${h.n - h.wrong}/${h.n} 정답, ${LEVELS[h.level].short}${h.book ? ', ' + esc(h.book) : ''}</span></span>
    <span class="row-side"><span class="chip">${ago(h.finished_at)}</span></span></li>`;
}

function renderHome(el) {
  const me = S.me, p = me.profile, open = me.open_session;
  const head = (stats) => `<div class="home-head"><div><p class="eyebrow">공부 티어 · ${today()}</p><h1>안녕하세요, ${esc(p.display_name)}</h1></div><div class="stats">${stats}</div></div>`;
  if (p.tier == null) {
    el.innerHTML = `<div class="home">${head('<div class="stat"><b>15</b>배치고사 문제</div>')}
      <section class="sec sec-tier"><div class="tier-card">
        <div class="tier-emblem">${emblemSVG(null)}</div>
        <div class="tier-info"><p class="eyebrow">아직 티어가 없어요</p><h2 class="tier-title">배치고사</h2>
          <p class="muted" style="margin:0;max-width:44ch">문제집에서 <b>15문제</b>를 풀고 채점하면 첫 티어가 정해져요. 학교 성적을 먼저 입력하면 배치에 함께 반영됩니다.</p>
          <div class="cta-row">${open ? '<button class="btn primary big" id="resume">배치고사 이어서 풀기</button>' : '<button class="btn primary big" id="placeBtn">배치고사 시작</button>'}
            <button class="btn big" id="schoolBtn">${p.school ? '학교 성적 수정' : '학교 성적 입력 (선택)'}</button></div></div></div></section>
      <section class="sec sec-teal"><div class="sec-head"><div><h2>이렇게 진행돼요</h2><p>앱이 문제 수를 정해 주고, 풀이와 채점은 내 문제집으로 해요.</p></div></div>
        <div class="card rules"><ol style="margin:0">
          <li>문제집 수준을 고르면 앱이 풀 문제 수(10~20개)를 정해 줘요.</li>
          <li>타이머가 도는 동안 내 문제집으로 풀고, 답지로 채점해요.</li>
          <li>답안지에 O/X를 표시하고 제출하면 LP가 오르내려요.</li>
          <li>100 LP를 채우면 승급전, 0 LP에서 지면 강등전이 시작돼요.</li></ol></div></section></div>`;
    $('#placeBtn')?.addEventListener('click', () => openStartSheet('placement'));
    $('#resume')?.addEventListener('click', () => enterPlay(open));
    $('#schoolBtn').onclick = goSchool;
    return;
  }
  const t = TIERS[p.tier];
  const chips = [];
  if (p.streak >= 2) chips.push(`<span class="chip blue">${p.streak}연승 중</span>`);
  if (p.streak <= -2) chips.push(`<span class="chip bad">${-p.streak}연패 중</span>`);
  if (p.shield > 0) chips.push(`<span class="chip ok">강등 보호 ${p.shield}판</span>`);
  const startLabel = p.series ? (p.series.type === 'promo' ? '승급전 시작' : '강등전 시작') : '랭크 게임 시작';
  el.innerHTML = `<div class="home">
    ${head(`<div class="stat"><b>${me.rank}</b>위</div><div class="stat"><b>${p.wins}</b>승 <b>${p.losses}</b>패</div><div class="stat"><b>${winRate(p.wins, p.losses)}%</b>승률</div>`)}
    <section class="sec sec-tier" aria-label="내 티어"><div class="tier-card">
      <div class="tier-emblem" id="heroEm">${emblemSVG(p.tier)}</div>
      <div class="tier-info">
        <p class="eyebrow">현재 티어</p>
        <h2 class="tier-title">${t.name}${p.tier < 7 ? `<span class="div">${ROMAN[p.div]}</span>` : ''}</h2>
        ${lpBlock(p)}
        ${seriesBlock(p.series)}
        ${chips.length ? `<div class="tier-meta">${chips.join('')}</div>` : ''}
        <div class="cta-row">${open
          ? `<button class="resume" id="resume"><b>진행 중인 판이 있어요</b><span>${open.n}문제, ${LEVELS[open.level].name}${open.kind === 'duel' ? ' 대결' : ''}. 눌러서 이어서 풀기</span></button>`
          : `<button class="btn primary big" id="startBtn">${startLabel}</button>`}</div>
      </div></div></section>
    <div class="cols">
      <section class="sec sec-teal"><div class="sec-head"><div><h2>정성평가</h2><p>최근 10판${p.a10 != null ? '과 학교 성적' : ''}을 종합한 평가예요.</p></div>
        ${p.a10 == null ? '<button class="btn small" id="toSchool">성적 입력</button>' : ''}</div>
        ${evalBlock(p.eval, '당신')}</section>
      <section class="sec sec-blue"><div class="sec-head"><div><h2>최근 기록</h2><p>판마다 얻고 잃은 LP예요.</p></div></div>
        ${me.history.length ? `<ul class="rows">${me.history.slice(0, 8).map(matchRow).join('')}</ul>` : '<div class="empty">아직 기록이 없어요.</div>'}</section>
    </div></div>`;
  $('#startBtn')?.addEventListener('click', () => openStartSheet('ranked'));
  $('#resume')?.addEventListener('click', () => enterPlay(open));
  $('#toSchool')?.addEventListener('click', goSchool);
  fx.setAmbient($('#heroEm'), t.color);
}
function goSchool() { S.tab = 'me'; render(); setTimeout(() => $('#schoolSec')?.scrollIntoView({ behavior: 'smooth' }), 50); }

// ---------------- 시작 시트: 문제집 수준 선택 ----------------
function openStartSheet(kind, duel = null) {
  const p = S.me.profile;
  let level = duel ? duel.level : S.level;
  const nGuess = kind === 'placement' ? '15문제' : kind === 'duel' ? '12문제' : `${BASE_COUNT[p.tier]}~${Math.min(20, BASE_COUNT[p.tier] + 2)}문제`;
  const title = kind === 'placement' ? '배치고사' : kind === 'duel' ? `${esc(duel.other.display_name)}와(과) 대결` : p.series ? (p.series.type === 'promo' ? '승급전' : '강등전') : '랭크 게임';
  const levels = LEVELS.slice(1).map((L) => `
    <button class="level" role="radio" aria-checked="${L.id === level}" data-lv="${L.id}" ${duel && L.id !== level ? 'disabled' : ''}>
      <span class="lv" style="--lc:${LEVEL_COLOR[L.id]}">${L.id}</span>
      <span><span class="lname">${L.name}</span><br><span class="ldesc">${L.desc}. 오답률 ${L.win}% 이하면 승리</span></span>
      <span class="lmul">×${(L.mult / 100).toFixed(2)}<small>획득 LP</small></span>
    </button>`).join('');
  const { el, close } = openSheet(`
    <div><h2>${title}</h2><p class="hint" style="margin-top:4px">${nGuess}를 풀게 돼요. ${duel ? '대결은 도전한 사람이 정한 수준으로 겨뤄요.' : '어려운 문제집일수록 오답을 더 허용하고 LP를 더 줘요.'}</p></div>
    <div class="levels" role="radiogroup" aria-label="문제집 수준">${levels}</div>
    <div class="field"><label for="book">문제집과 범위 (선택, 친구들에게 보여요)</label><input id="book" maxlength="60" placeholder="예: 쎈 수학Ⅰ 지수함수 p.80~85" value="${esc(store.get('st_book') || '')}"></div>
    <p class="hint">시작하면 타이머가 돌아요. 문제당 최소 ${RULES.minSecPerProblem}초가 지나야 제출할 수 있고, ${RULES.maxSessionHours}시간 안에 제출하지 않으면 패배로 처리돼요.</p>
    <div class="sheet-foot"><button class="btn" id="cancel">취소</button><button class="btn primary" id="go">${kind === 'duel' ? '대결 시작' : '문제 배정받기'}</button></div>`, { label: title });
  $$('.level', el).forEach((b) => (b.onclick = () => {
    if (b.disabled) return;
    level = Number(b.dataset.lv); fx.sfx.tap();
    $$('.level', el).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));
  $('#cancel', el).onclick = close;
  $('#go', el).onclick = (e) => run(async () => {
    const book = $('#book', el).value.trim();
    store.set('st_book', book);
    if (!duel) { S.level = level; store.set('st_level', level); }
    const s = await api.rpc('start_session', { p_kind: kind, p_level: level, p_duel: duel?.id ?? null, p_book: book || null });
    close();
    await intro(s, duel);
    enterPlay(s);
  }, e.currentTarget);
}

// ---------------- 시작 연출 ----------------
function openStage(red = false) {
  const st = document.createElement('div');
  st.className = 'stage' + (red ? ' red' : '');
  st.innerHTML = '<div class="stage-inner"></div>';
  layer.appendChild(st);
  return { st, inner: st.firstChild, close: () => st.remove() };
}
async function intro(s, duel) {
  const p = S.me.profile;
  const series = s.kind === 'ranked' ? p.series : null;
  const { st, inner, close } = openStage(series?.type === 'demote');
  let skip = false;
  st.onclick = () => { skip = true; };
  const wait = async (ms) => { const t0 = Date.now(); while (!skip && Date.now() - t0 < ms) await sleep(30); };

  if (s.kind === 'duel' && duel) {
    inner.innerHTML = `<p class="eyebrow">1:1 대결</p><div class="vs">
      <div class="vs-side left">${emblemSVG(p.tier, { size: 120 })}<b>${esc(p.display_name)}</b><span class="chip">${tierSpan(p.tier, p.div)}</span></div>
      <div class="vs-word">VS</div>
      <div class="vs-side right">${emblemSVG(duel.other.tier, { size: 120 })}<b>${esc(duel.other.display_name)}</b><span class="chip">${tierSpan(duel.other.tier, duel.other.div)}</span></div></div>
      <div class="stage-stats"><div class="stat"><b>${s.n}</b>문제</div><div class="stat"><b>${LEVELS[s.level].short}</b>수준</div></div>
      <p class="stage-note">오답이 적은 쪽이 이기고, 같으면 더 빨리 푼 쪽이 이겨요.</p>`;
    fx.sfx.whoosh(); await sleep(380); fx.sfx.slam(); fx.shake(st, true);
    await wait(2200); close(); return;
  }

  const label = s.kind === 'placement' ? '배치고사' : series ? (series.type === 'promo' ? '승급전' : '강등전') : '랭크 게임';
  inner.innerHTML = `<p class="eyebrow">${label} · 문제 배정 중</p><div class="rolling" id="roll">10</div><p class="stage-note" id="rollSub">문제</p>`;
  const roll = $('#roll', inner);
  if (fx.settings.motion) {
    let delay = 40;
    for (let i = 0; i < 16 && !skip; i++) {
      roll.textContent = 10 + Math.floor(Math.random() * 11);
      fx.sfx.tick(); await sleep(delay); delay *= 1.16;
    }
  }
  roll.textContent = s.n;
  roll.style.animation = 'slam .45s cubic-bezier(.2,1.4,.4,1) both';
  fx.sfx.slam();
  const [x, y] = fx.centerOf(roll);
  fx.ring(x, y, tierColor(p.tier), 200);
  $('#rollSub', inner).innerHTML = `<b>${s.n}문제</b>를 풀어야 해요`;
  const k = s.max_wrong_to_win;
  inner.insertAdjacentHTML('beforeend', `<div class="stage-banner ${series?.type === 'demote' ? 'red' : 'tier'}" style="animation-delay:.3s">${k === 0 ? '전부 맞혀야 승리' : `오답 ${k}개까지 승리`}</div>
    <p class="stage-note">${LEVELS[s.level].name}${s.kind === 'placement' ? ', 결과와 학교 성적으로 첫 티어가 정해져요' : ''}</p>`);
  if (series) {
    inner.insertAdjacentHTML('beforeend', seriesBlock(series));
    if (series.type === 'demote') {
      const v = document.createElement('div'); v.className = 'vignette-red'; st.appendChild(v);
      fx.sfx.heartbeat(); await wait(900); fx.sfx.heartbeat();
    } else fx.sfx.series();
  }
  inner.insertAdjacentHTML('beforeend', '<p class="hint">화면을 누르면 바로 시작</p>');
  await wait(2600);
  close();
}

// ---------------- 풀이 화면 ----------------
function enterPlay(s) {
  let marks = [];
  try { marks = JSON.parse(store.get('st_marks_' + s.id) || '[]'); } catch { marks = []; }
  if (marks.length !== s.n) marks = Array(s.n).fill('');
  S.play = { s, marks, combo: 0, dangerShown: false };
  fx.setAmbient(null);
  window.scrollTo(0, 0);
  renderPlay();
}
function saveMarks() { store.set('st_marks_' + S.play.s.id, JSON.stringify(S.play.marks)); }
function cellInner(m) {
  if (m === 'O') return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="stroke" cx="50" cy="52" r="34"/></svg>';
  if (m === 'X') return '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="stroke" d="M24 80 L78 22"/></svg>';
  return '';
}
function renderPlay() {
  const { s, marks } = S.play;
  const p = S.me.profile;
  const kindLabel = s.kind === 'placement' ? '배치고사' : s.kind === 'duel' ? '대결' : p.series ? (p.series.type === 'promo' ? '승급전' : '강등전') : '랭크 게임';
  app.innerHTML = `<div class="main" style="padding-bottom:max(40px,env(safe-area-inset-bottom,0px))"><div class="play">
    <div class="play-head">
      <div><p class="eyebrow">${LEVELS[s.level].name}${s.book ? ' · ' + esc(s.book) : ''}</p><h1>${kindLabel}, ${s.n}문제</h1></div>
      <div class="timer" id="timer" aria-label="경과 시간">00:00</div>
    </div>
    <div class="goal" id="goal"></div>
    <p class="hint">문제집에서 ${s.n}문제를 풀고 답지로 채점한 다음, 답안지 칸을 눌러 표시하세요. 한 번 누르면 O(정답), 두 번 누르면 X(오답), 세 번 누르면 지워져요.</p>
    <div class="omr" id="omr">
      <div class="omr-head"><b>답안지</b><span>${s.n}문항</span></div>
      <div class="omr-grid">${marks.map((m, i) => `<button class="cell ${m === 'O' ? 'o' : m === 'X' ? 'x' : ''}" data-i="${i}" aria-label="${i + 1}번 ${m === 'O' ? '정답' : m === 'X' ? '오답' : '미채점'}"><span class="no">${i + 1}</span>${cellInner(m)}</button>`).join('')}</div>
      <div class="omr-tools"><button class="btn small" id="fillO">남은 칸 모두 O</button><button class="btn small" id="clearAll">모두 지우기</button></div>
    </div>
    <div class="submit-bar">
      <button class="btn primary big" id="submit">결과 제출</button>
      <p class="hint" id="hint" style="text-align:center"></p>
      ${s.demo ? '<p class="hint">체험 모드에서는 최소 풀이 시간 제한이 없어요.</p>' : ''}
      <div class="play-links"><button class="linkbtn" id="back">로비로 (판은 계속 진행)</button><button class="linkbtn" id="quit" style="color:var(--danger)">포기하기</button></div>
    </div></div></div>`;
  $$('.cell').forEach((c) => (c.onclick = () => markCell(Number(c.dataset.i))));
  $('#fillO').onclick = async () => {
    const idx = S.play.marks.map((m, i) => (m ? -1 : i)).filter((i) => i >= 0);
    for (const i of idx) { S.play.marks[i] = ''; markCell(i, true); await sleep(60); }
  };
  $('#clearAll').onclick = async () => {
    if (!S.play.marks.some(Boolean)) return;
    if (!(await confirmSheet('모두 지울까요?', '표시한 O/X가 모두 지워져요.', '지우기', true))) return;
    S.play.marks = Array(s.n).fill(''); S.play.combo = 0; saveMarks(); renderPlay();
  };
  $('#submit').onclick = (e) => submitPlay(e.currentTarget);
  $('#quit').onclick = quitPlay;
  $('#back').onclick = async () => { stopTimer(); S.play = null; await loadMe(); render(); };
  updateGoal(false);
  startTimer();
}
function updateGoal(animate = true) {
  const { s, marks } = S.play;
  const k = s.max_wrong_to_win;
  const wrong = marks.filter((m) => m === 'X').length;
  const right = marks.filter((m) => m === 'O').length;
  const over = wrong > k;
  const goal = $('#goal');
  if (!goal) return;
  goal.classList.toggle('danger', over);
  const lives = Array.from({ length: k }, (_, i) => `<span class="life ${i < wrong ? 'lost' : ''}">${ICON.shield}</span>`).join('');
  goal.innerHTML = `${k ? `<div class="lives" aria-hidden="true">${lives}</div>` : ''}
    <div class="goal-text">${over ? `<b>${wrong}</b>개 틀림, 승리 조건(오답 ${k}개 이하)을 넘었어요` : k === 0 ? '오답 없이 전부 맞혀야 승리' : `남은 오답 허용 <b>${k - wrong}</b>개`}</div>
    <div class="goal-count"><span class="chip ok">O ${right}</span><span class="chip bad">X ${wrong}</span></div>`;
  if (over && !S.play.dangerShown && animate) { S.play.dangerShown = true; fx.sfx.danger(); fx.shake(app, true); }
  if (!over) S.play.dangerShown = false;
}
function markCell(i, forceO = false) {
  const play = S.play;
  const cur = play.marks[i];
  const next = forceO ? 'O' : cur === '' ? 'O' : cur === 'O' ? 'X' : '';
  play.marks[i] = next;
  saveMarks();
  const c = $(`.cell[data-i="${i}"]`);
  c.className = 'cell ' + (next === 'O' ? 'o' : next === 'X' ? 'x' : '');
  c.innerHTML = `<span class="no">${i + 1}</span>${cellInner(next)}`;
  c.setAttribute('aria-label', `${i + 1}번 ${next === 'O' ? '정답' : next === 'X' ? '오답' : '미채점'}`);
  const [x, y] = fx.centerOf(c);
  if (next === 'O') {
    play.combo++;
    fx.sfx.mark();
    fx.burst(x, y, { colors: ['#D7263D', '#F28B9A', '#E2AF2E'], count: 14, speed: 4, size: 2.5, life: 34 });
    if (play.combo >= 3 && [3, 5, 7, 10, 15, 20].includes(play.combo)) {
      fx.sfx.combo(play.combo);
      const d = document.createElement('div');
      d.className = 'combo'; d.textContent = `${play.combo} 연속 정답!`;
      document.body.appendChild(d); setTimeout(() => d.remove(), 850);
    }
  } else if (next === 'X') {
    play.combo = 0;
    fx.sfx.wrong();
    fx.shake(c);
  } else fx.sfx.tap();
  updateGoal();
  updateHint();
}
function startTimer() {
  stopTimer();
  const tick = () => {
    if (!S.play) return stopTimer();
    const el = $('#timer'); if (!el) return;
    const sec = (Date.now() + S.offset - new Date(S.play.s.started_at).getTime()) / 1000;
    el.textContent = fmtTime(sec);
    updateHint(sec);
  };
  tick();
  S.timer = setInterval(tick, 1000);
}
function stopTimer() { clearInterval(S.timer); S.timer = 0; }
function updateHint(sec) {
  if (!S.play) return;
  const { s, marks } = S.play;
  if (sec == null) sec = (Date.now() + S.offset - new Date(s.started_at).getTime()) / 1000;
  const blanks = marks.filter((m) => !m).length;
  const left = Math.ceil(s.min_seconds - sec);
  const hint = $('#hint'), btn = $('#submit');
  if (!hint) return;
  if (blanks) hint.textContent = `아직 채점하지 않은 문제가 ${blanks}개 있어요.`;
  else if (left > 0) hint.textContent = `제출 가능까지 ${fmtTime(left)} (문제당 최소 ${RULES.minSecPerProblem}초)`;
  else hint.textContent = '준비됐어요. 제출하면 결과가 확정돼요.';
  btn.disabled = blanks > 0 || left > 0;
}
async function submitPlay(btn) {
  const { s, marks } = S.play;
  const r = await run(() => api.rpc('finish_session', { p_session: s.id, p_marks: marks.join(''), p_book: s.book }), btn);
  if (!r) return;
  store.remove('st_marks_' + s.id);
  stopTimer();
  await showResult(r);
}
async function quitPlay() {
  const s = S.play.s;
  const msg = s.kind === 'duel' ? '대결에서 패배하게 돼요.' : s.kind === 'placement' ? '모든 문제를 틀린 것으로 배치돼요.' : '이번 판은 탈주 패배(-25 LP 기준)로 기록돼요.';
  if (!(await confirmSheet('정말 포기할까요?', msg, '포기하기', true))) return;
  const r = await run(() => api.rpc('abandon_session', { p_session: s.id }));
  if (!r) return;
  store.remove('st_marks_' + s.id);
  stopTimer();
  await showResult(r);
}

// ---------------- 결과 연출 ----------------
async function showResult(r) {
  const before = S.me.profile;
  S.play = null;
  if (r.kind === 'duel') await duelResult(r, before);
  else if (r.kind === 'placement') await placementResult(r);
  else await rankedResult(r);
  await loadMe();
  render();
}
function stageButtons(inner, again) {
  return new Promise((res) => {
    inner.insertAdjacentHTML('beforeend', `<div class="stage-actions">${again ? '<button class="btn primary big" data-a="again">한 판 더</button>' : ''}<button class="btn big" data-a="lobby">로비로</button></div>`);
    $$('.stage-actions button', inner).forEach((b) => (b.onclick = () => res(b.dataset.a)));
    $('.stage-actions button', inner).focus({ preventScroll: true });
  });
}
const statRow = (r) => `<div class="stage-stats">
  <div class="stat"><b>${r.n - r.wrong}/${r.n}</b>정답</div>
  <div class="stat"><b>${r.wrong}</b>오답</div>
  <div class="stat"><b>${LEVELS[r.level].short}</b>수준</div>
  <div class="stat"><b>${fmtTime(r.secs)}</b>시간</div></div>`;
const tierTitle = (t, d, id = '') => `<h2 class="tier-title" ${id ? `id="${id}"` : ''}>${t == null ? '배치 전' : TIERS[t].name}${t != null && t < 7 ? `<span class="div">${ROMAN[d]}</span>` : ''}</h2>`;

async function rankedResult(r) {
  const win = r.win;
  const word = r.result === 'perfect' ? 'PERFECT' : RESULT_INFO[r.result].ko;
  const wcls = r.result === 'perfect' ? 'perfect' : win ? 'victory' : 'defeat';
  setTheme(r.before.tier);
  const { st, inner, close } = openStage(!win);
  inner.innerHTML = `<p class="eyebrow">랭크 게임 결과</p><div class="big-word ${wcls}">${word}</div>${statRow(r)}`;
  if (win) {
    fx.sfx.victory();
    const [x, y] = fx.centerOf($('.big-word', inner));
    fx.burst(x, y, { colors: r.result === 'perfect' ? ['#E2AF2E', '#F5D477', '#B98300'] : ['#285FC4', '#79A3F2', '#DCE6F9'], count: 60, speed: 9 });
    if (r.result === 'perfect') fx.confetti(['#E2AF2E', '#D7263D', '#285FC4', '#2C8A4B']);
  } else { fx.sfx.defeat(); fx.shake(st, true); }
  await sleep(1100);

  const b = r.before, a = r.after;
  const tierChanged = b.tier !== a.tier || b.div !== a.div;
  inner.insertAdjacentHTML('beforeend', `
    <div class="stage-emblem" id="rEm">${emblemSVG(b.tier)}</div>
    ${tierTitle(b.tier, b.div, 'rName')}
    <div class="lp" id="rLp"><div class="lp-head"><span><b id="lpNum">${b.lp}</b> LP</span><b id="rDelta"></b></div>
      <div class="lp-track"><div class="lp-fill" id="lpFill" style="width:${lpPct(b.tier, b.lp)}%"></div></div></div>
    <div id="rSeries">${b.series ? seriesBlock(b.series) : ''}</div>
    <div id="rBanner"></div>`);
  const em = $('#rEm', inner), lpNum = $('#lpNum', inner), fill = $('#lpFill', inner), deltaEl = $('#rDelta', inner);
  const ev = r.events || [];
  const banner = (html, cls = 'gold') => { $('#rBanner', inner).innerHTML = `<div class="stage-banner ${cls}">${html}</div>`; };
  const note = (txt) => inner.insertAdjacentHTML('beforeend', `<p class="stage-note">${txt}</p>`);

  if (!b.series) {
    const target = tierChanged ? (r.lpDelta > 0 ? ceilLP(b.tier) : floorLP(b.tier)) : a.lp;
    deltaEl.textContent = (r.lpDelta > 0 ? '+' : '') + r.lpDelta;
    deltaEl.style.color = r.lpDelta >= 0 ? 'var(--blue)' : 'var(--danger)';
    fill.style.width = lpPct(b.tier, target) + '%';
    await countUp(lpNum, b.lp, target, 900, () => fx.sfx.lpUp());
  }
  if (r.adjust && !b.series) note(r.adjust > 0 ? `실력 점수(MMR)가 티어보다 높아 +${r.adjust} 보정` : `실력 점수(MMR)가 티어보다 낮아 ${r.adjust} 보정`);
  await sleep(300);

  const seriesEl = $('#rSeries', inner);
  if (ev.includes('promo_start')) {
    fx.sfx.series();
    const [x, y] = fx.centerOf(em); fx.ring(x, y, TIERS[b.tier].color, 220); fx.burst(x, y, { colors: [TIERS[b.tier].color, TIERS[b.tier].glow], count: 40 });
    banner(a.series.scope === 'tier' ? '티어 승급전 진출!' : '승급전 진출!');
    seriesEl.innerHTML = seriesBlock(a.series);
    $$('.pip', seriesEl).forEach((p, i) => { p.classList.add('pop'); p.style.animationDelay = i * 0.12 + 's'; });
    note(`${a.series.games}판 중 ${a.series.need}판을 먼저 이기면 승급해요`);
  }
  if (ev.includes('promo_progress') || ev.includes('demote_progress')) {
    seriesEl.innerHTML = seriesBlock(a.series);
    const pips = $$('.pip', seriesEl);
    const last = win ? pips[a.series.wins - 1] : pips[a.series.wins + a.series.losses - 1];
    last?.classList.add('pop');
    win ? fx.sfx.series() : fx.sfx.wrong();
    const left = a.series.need - a.series.wins;
    banner(a.series.type === 'promo' ? (win ? `승급까지 ${left}승 남았어요` : '아직 기회가 있어요') : (win ? '한 번 더 이기면 생존!' : '벼랑 끝입니다'), a.series.type === 'promo' ? 'gold' : 'red');
  }
  if (ev.includes('shield_used')) {
    banner('강등 보호 발동', 'blue');
    note(`승급 직후라 강등전이 시작되지 않았어요. 보호 ${a.shield}판 남음`);
  }
  if (ev.includes('demote_start')) {
    st.classList.add('red');
    const v = document.createElement('div'); v.className = 'vignette-red'; st.appendChild(v);
    fx.sfx.heartbeat(); await sleep(700); fx.sfx.heartbeat();
    banner('강등전 돌입', 'red');
    seriesEl.innerHTML = seriesBlock(a.series);
    note('다음 3판 중 2판을 이기면 지켜낼 수 있어요');
  }
  if (ev.includes('demote_survived')) {
    seriesEl.innerHTML = '';
    fx.sfx.victory();
    const [x, y] = fx.centerOf(em); fx.ring(x, y, '#285FC4', 240); fx.burst(x, y, { colors: ['#285FC4', '#79A3F2'], count: 60 });
    banner('강등 방어 성공!', 'blue');
    fill.style.width = lpPct(a.tier, a.lp) + '%'; lpNum.textContent = a.lp;
  }
  if (ev.includes('promo_failed')) {
    seriesEl.innerHTML = seriesBlock({ ...b.series, losses: b.series.losses + 1 });
    await sleep(500);
    fx.sfx.defeat();
    banner('승급 실패', 'red');
    seriesEl.innerHTML = '';
    fill.style.width = lpPct(a.tier, a.lp) + '%';
    await countUp(lpNum, b.lp, a.lp, 700);
    note(`${a.lp} LP에서 다시 도전해요`);
  }
  if (ev.includes('promoted')) {
    if (b.series) {
      seriesEl.innerHTML = seriesBlock({ ...b.series, wins: b.series.wins + 1 });
      $$('.pip.w', seriesEl).pop()?.classList.add('pop');
      await sleep(600);
    }
    await promoteCinematic(inner, em, b, a);
  }
  if (ev.includes('demoted')) await demoteCinematic(inner, st, em, b, a);
  if (r.eval) note(`정성평가 ${esc(r.eval.grade)} (${r.eval.total}점)${r.streak >= 3 ? `, ${r.streak}연승 보너스 +3` : ''}`);
  setTheme(a.tier);
  const act = await stageButtons(inner, true);
  close();
  if (act === 'again') { await loadMe(); render(); openStartSheet('ranked'); }
}

async function promoteCinematic(inner, em, b, a) {
  const tierUp = a.tier !== b.tier;
  $('#rBanner', inner).innerHTML = '';
  $('#rLp', inner).style.visibility = 'hidden';
  em.classList.add('tremble');
  $('svg', em).classList.add('grow-glow');
  fx.sfx.promo();
  const [x, y] = fx.centerOf(em);
  for (let i = 0; i < 6; i++) { fx.burst(x, y, { colors: [TIERS[b.tier].color, TIERS[b.tier].glow], count: 10, speed: 3 + i, gravity: 0, life: 30 }); await sleep(200); }
  fx.flash('#ffffff', 700);
  em.classList.remove('tremble');
  setTheme(a.tier);
  em.innerHTML = emblemSVG(a.tier);
  $('svg', em).classList.add('rise');
  const t = TIERS[a.tier];
  fx.ring(x, y, t.color, 300, 60); fx.ring(x, y, t.glow, 200, 45);
  fx.burst(x, y, { colors: [t.color, t.glow, t.c2], count: tierUp ? 120 : 70, speed: tierUp ? 13 : 9, life: 70 });
  if (tierUp) fx.confetti([t.color, t.glow, t.c2, '#E2AF2E'], 180);
  $('#rName', inner).outerHTML = tierTitle(a.tier, a.div, 'rName');
  $('#rName', inner).classList.add('rise');
  $('#rSeries', inner).innerHTML = '';
  $('#rBanner', inner).innerHTML = `<div class="stage-banner tier">${tierUp ? '티어 승급!' : '승급!'}</div>`;
  inner.insertAdjacentHTML('beforeend', `<p class="stage-note">앞으로 ${RULES.shieldGames}판 동안 강등 보호가 적용돼요.</p>`);
  fx.setAmbient(em, t.color);
  await sleep(1400);
  fx.setAmbient(null);
}

async function demoteCinematic(inner, st, em, b, a) {
  $('#rBanner', inner).innerHTML = '';
  $('#rSeries', inner).innerHTML = '';
  $('#rLp', inner).style.visibility = 'hidden';
  st.classList.add('red');
  const svg = $('svg', em);
  svg.classList.add('crack');
  fx.sfx.demote();
  fx.shake(st, true);
  await sleep(1000);
  const [x, y] = fx.centerOf(em);
  fx.shards(x, y, TIERS[b.tier].color, 50);
  fx.flash('#C0352A', 500);
  svg.classList.add('vanish');
  await sleep(700);
  setTheme(a.tier);
  em.innerHTML = emblemSVG(a.tier);
  $('svg', em).classList.add('rise');
  $('#rName', inner).outerHTML = tierTitle(a.tier, a.div, 'rName');
  $('#rBanner', inner).innerHTML = '<div class="stage-banner red">강등</div>';
  inner.insertAdjacentHTML('beforeend', `<p class="stage-note">${a.lp} LP에서 다시 시작해요. 금방 돌아갈 수 있어요.</p>`);
  await sleep(600);
}

async function placementResult(r) {
  const { inner, close } = openStage(false);
  inner.innerHTML = `<p class="eyebrow">배치고사 결과</p>${statRow(r)}<div class="stage-emblem" id="slot">${emblemSVG(null)}</div><h2 class="tier-title" id="pName">판정 중</h2>`;
  await sleep(900);
  const slot = $('#slot', inner);
  const target = r.after.tier;
  const top = Math.min(9, target + 2);
  let delay = 45;
  if (fx.settings.motion) {
    for (let i = 0; i < 20; i++) {
      const t = i < 16 ? Math.floor(Math.random() * (top + 1)) : (target + 20 - i) % (top + 1);
      slot.innerHTML = emblemSVG(t); setTheme(t);
      $('#pName', inner).textContent = TIERS[t].name;
      fx.sfx.tick(); await sleep(delay); delay *= 1.12;
    }
  }
  setTheme(target);
  slot.innerHTML = emblemSVG(target);
  $('svg', slot).classList.add('rise');
  fx.flash('#ffffff', 600); fx.sfx.promo();
  const [x, y] = fx.centerOf(slot); const t = TIERS[target];
  fx.ring(x, y, t.color, 280, 55); fx.burst(x, y, { colors: [t.color, t.glow, t.c2], count: 110, speed: 12, life: 70 });
  fx.confetti([t.color, t.glow, t.c2], 150);
  $('#pName', inner).outerHTML = tierTitle(target, r.after.div);
  inner.insertAdjacentHTML('beforeend', `<div class="lp"><div class="lp-head"><span><b>${r.after.lp}</b> LP</span><span>배치 완료</span></div><div class="lp-track"><div class="lp-fill" style="width:${lpPct(target, r.after.lp)}%"></div></div></div>
    <p class="stage-note">${S.me.profile.a10 != null ? '문제 풀이 결과와 학교 성적을 함께 반영했어요.' : '학교 성적을 입력하면 앞으로 LP 보정에 반영돼요.'} 배치는 최고 플래티넘 IV까지 받을 수 있어요.</p>`);
  const act = await stageButtons(inner, true);
  close();
  if (act === 'again') { await loadMe(); render(); openStartSheet('ranked'); }
}

async function duelResult(r, me) {
  const d = r.duel;
  const { st, inner, close } = openStage(false);
  const side = (who) => who === 'me'
    ? `<div class="vs-side left" id="vsMe">${emblemSVG(me.tier, { size: 120 })}<b>${esc(me.display_name)}</b><span class="mono">${d.my_wrong ?? '-'}개 오답</span><span class="hint">${d.my_secs != null && d.my_secs < 999999 ? fmtTime(d.my_secs) : '포기'}</span></div>`
    : `<div class="vs-side right" id="vsThem">${emblemSVG(d.other.tier, { size: 120 })}<b>${esc(d.other.display_name)}</b><span class="mono">${d.their_wrong != null ? d.their_wrong + '개 오답' : '대기 중'}</span><span class="hint">${d.their_secs != null ? (d.their_secs < 999999 ? fmtTime(d.their_secs) : '포기') : '아직 풀지 않음'}</span></div>`;
  inner.innerHTML = `<p class="eyebrow">대결 결과</p><div class="vs">${side('me')}<div class="vs-word">VS</div>${side('them')}</div>`;
  fx.sfx.whoosh(); await sleep(400); fx.sfx.slam();
  await sleep(1200);
  if (d.status !== 'done') {
    inner.insertAdjacentHTML('beforeend', `<div class="stage-banner blue">기록 제출 완료</div><p class="stage-note">${esc(d.other.display_name)}이(가) 아직 풀지 않았어요. 결과는 대결 탭에서 확인하세요.</p>`);
  } else {
    const meWin = d.winner === 'me', draw = d.winner === 'draw';
    if (!draw) {
      $(meWin ? '#vsThem' : '#vsMe', inner).classList.add('lose');
      $(meWin ? '#vsMe' : '#vsThem', inner).classList.add('win');
    }
    const el = $(meWin ? '#vsMe' : '#vsThem', inner);
    inner.insertAdjacentHTML('beforeend', `<div class="big-word ${draw ? 'perfect' : meWin ? 'victory' : 'defeat'}" style="font-size:clamp(2.6rem,12vw,4.4rem)">${draw ? '무승부' : meWin ? '대결 승리' : '대결 패배'}</div>
      ${d.my_wrong === d.their_wrong && !draw ? '<p class="stage-note">오답 수가 같아 풀이 시간으로 승부가 갈렸어요.</p>' : ''}`);
    if (meWin) { fx.sfx.victory(); const [x, y] = fx.centerOf(el); fx.burst(x, y, { colors: ['#E2AF2E', '#285FC4'], count: 80, speed: 10 }); fx.confetti(['#E2AF2E', '#285FC4', '#2C8A4B', '#DB8429']); }
    else if (!draw) { fx.sfx.defeat(); fx.shake(st, true); }
  }
  await stageButtons(inner, false);
  close();
  S.tab = 'duel';
}

// ---------------- 랭킹 ----------------
async function renderRank(el) {
  const group = S.me.profile.group_code;
  el.innerHTML = `<div class="home">
    <div class="home-head"><div><p class="eyebrow">공부 티어 · 랭킹</p><h1>누가 제일 높을까요</h1></div>
      <div class="seg" role="group" aria-label="랭킹 범위">
        <button data-sc="all" aria-pressed="${S.boardScope === 'all'}">전체</button>
        ${group ? `<button data-sc="group" aria-pressed="${S.boardScope === 'group'}">우리 반 (${esc(group)})</button>` : ''}
      </div></div>
    <div id="board"><div class="empty">불러오는 중…</div></div></div>`;
  $$('[data-sc]', el).forEach((b) => (b.onclick = () => { S.boardScope = b.dataset.sc; renderRank(el); }));
  const rows = await run(() => api.rpc('leaderboard', { p_group: S.boardScope === 'group' ? group : null }));
  if (!rows) return;
  const board = $('#board', el);
  if (!rows.length) { board.innerHTML = '<div class="empty">아직 배치를 마친 학생이 없어요. 첫 번째 주인공이 되어 보세요.</div>'; return; }
  const pod = (r, cls, place) => r ? `<button class="pod ${cls}" data-u="${esc(r.username)}"><span class="place">${place}</span>${emblemSVG(r.tier, { size: 140 })}<span class="nm">${esc(r.display_name)}</span><span class="tl">${tierSpan(r.tier, r.div)}, ${r.lp} LP</span></button>` : '<span></span>';
  const row = (r) => `<li><button class="row rank ${r.is_me ? 'me' : ''}" data-u="${esc(r.username)}">
    <span class="row-tile"><b>${r.rank}</b></span>${emblemSVG(r.tier, { size: 48 })}
    <span class="row-main"><span class="row-title">${esc(r.display_name)} ${r.group_code ? `<span class="chip">${esc(r.group_code)}</span>` : ''}${r.series_type === 'promo' ? ' <span class="chip gold">승급전</span>' : r.series_type === 'demote' ? ' <span class="chip bad">강등전</span>' : ''}</span>
      <span class="row-sub">${r.wins}승 ${r.losses}패${r.grade ? `, 평가 ${esc(r.grade)}` : ''}</span></span>
    <span class="row-side"><span class="tname" style="color:${TIERS[r.tier].c2}">${tierSpan(r.tier, r.div)}</span><b>${r.lp} LP</b></span></button></li>`;
  const meRow = rows.find((r) => r.is_me);
  const above = meRow && meRow.rank > 1 ? rows[meRow.rank - 2] : null;
  board.innerHTML = `<div class="rank-cols">
    <div class="sticky">
      <section class="sec sec-orange"><div class="sec-head"><div><h2>상위 3명</h2><p>${S.boardScope === 'group' ? '우리 반' : '전체'} 기준이에요.</p></div></div>
        <div class="podium">${pod(rows[1], 'second', '2위')}${pod(rows[0], 'first', '1위')}${pod(rows[2], 'third', '3위')}</div></section>
      ${meRow ? `<div class="card"><p class="eyebrow">내 위치</p><p style="margin:4px 0 0;font-size:15px"><b class="mono" style="font-size:22px">${meRow.rank}</b>위${above ? `, 바로 위는 ${esc(above.display_name)} (${tierSpan(above.tier, above.div)}, ${above.lp} LP)` : ', 정상입니다'}</p></div>` : ''}
    </div>
    <section class="sec sec-blue"><div class="sec-head"><div><h2>전체 순위</h2><p>눌러서 프로필을 보고 도전장을 보낼 수 있어요.</p></div></div>
      <ul class="rows">${rows.map(row).join('')}</ul></section></div>`;
  $$('[data-u]', board).forEach((b) => (b.onclick = () => openProfile(b.dataset.u)));
}

async function openProfile(username) {
  const data = await run(() => api.rpc('get_profile', { p_username: username }));
  if (!data) return;
  const p = data.profile;
  const peak = p.peak_pos >= 0 ? (() => { const pos = p.peak_pos; const t = pos >= 2800 ? (pos - 2800 >= 600 ? 9 : pos - 2800 >= 300 ? 8 : 7) : Math.floor(pos / 400); const d = t < 7 ? 4 - Math.floor((pos % 400) / 100) : 0; return tierLabel(t, d); })() : '-';
  const color = p.tier == null ? 'var(--ink-3)' : TIERS[p.tier].c2;
  const { el, close } = openSheet(`
    <div style="display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center">
      <div style="width:110px;color:var(--ink-3)">${emblemSVG(p.tier, { size: 110 })}</div>
      <div><p class="eyebrow">@${esc(p.username)}${p.group_code ? ` · ${esc(p.group_code)}` : ''}</p><h2>${esc(p.display_name)}</h2>
        <p style="margin:2px 0 0;font-weight:700;color:${color}">${tierSpan(p.tier, p.div)}${p.tier != null ? ` <span class="mono" style="color:var(--ink)">${p.lp} LP</span>` : ''}</p></div>
    </div>
    <div class="stats">
      <div class="stat"><b>${data.rank ?? '-'}</b>위</div>
      <div class="stat"><b>${p.wins}</b>승 <b>${p.losses}</b>패</div>
      <div class="stat"><b>${p.duel_wins}</b>대결승</div>
      <div class="stat">최고 <b style="font-size:15px">${esc(peak)}</b></div>
      ${p.a10 != null ? `<div class="stat"><b>${(p.a10 / 10).toFixed(1)}</b>학업 지수</div>` : ''}
    </div>
    ${evalBlock(p.eval, p.display_name, p.is_me)}
    <div><p class="eyebrow" style="margin-bottom:8px">최근 기록 · ${ago(p.last_played)}</p>
      ${data.history.length ? `<ul class="rows">${data.history.map(matchRow).join('')}</ul>` : '<div class="empty">기록이 없어요.</div>'}</div>
    <div class="sheet-foot"><button class="btn" id="closeP">닫기</button>${p.is_me ? '' : '<button class="btn primary" id="challenge">도전장 보내기</button>'}</div>`, { label: p.display_name + ' 프로필' });
  $('#closeP', el).onclick = close;
  $('#challenge', el)?.addEventListener('click', () => { close(); openDuelCreate(p.username, p.display_name); });
}

// ---------------- 대결 ----------------
function openDuelCreate(username = '', name = '') {
  let level = 2;
  const { el, close } = openSheet(`<div><h2>도전장 보내기</h2>
    <p class="hint" style="margin-top:4px">같은 수준의 문제집으로 12문제씩 풀어 오답이 적은 쪽이 이겨요. 오답 수가 같으면 더 빨리 푼 쪽이 이깁니다. 대결은 랭크 LP에 영향을 주지 않아요.</p></div>
    <div class="field"><label for="opp">상대 아이디</label><input id="opp" value="${esc(username)}" placeholder="예: math_king" autocapitalize="none"></div>
    <div class="levels" role="radiogroup" aria-label="문제집 수준">${LEVELS.slice(1).map((L) => `<button class="level" role="radio" aria-checked="${L.id === level}" data-lv="${L.id}"><span class="lv" style="--lc:${LEVEL_COLOR[L.id]}">${L.id}</span><span><span class="lname">${L.name}</span><br><span class="ldesc">${L.desc}</span></span><span></span></button>`).join('')}</div>
    <div class="sheet-foot"><button class="btn" id="cancel">취소</button><button class="btn primary" id="send">${name ? esc(name) + '에게 ' : ''}도전장 보내기</button></div>`, { label: '도전장 보내기' });
  $$('.level', el).forEach((b) => (b.onclick = () => { level = Number(b.dataset.lv); $$('.level', el).forEach((x) => x.setAttribute('aria-checked', String(x === b))); }));
  $('#cancel', el).onclick = close;
  $('#send', el).onclick = (e) => run(async () => {
    const opp = $('#opp', el).value.trim().toLowerCase();
    if (!opp) throw new Error('USER_NOT_FOUND');
    const d = await api.rpc('create_duel', { p_opponent: opp, p_level: level });
    close();
    fx.sfx.slam();
    toast(`${d.other.display_name}에게 도전장을 보냈어요. 지금 바로 먼저 풀 수 있어요.`);
    S.tab = 'duel'; render();
  }, e.currentTarget);
}

async function renderDuels(el) {
  el.innerHTML = `<div class="home"><div class="home-head"><div><p class="eyebrow">공부 티어 · 대결</p><h1>친구와 1:1 대결</h1></div>
    <button class="btn primary" id="newDuel">도전장 보내기</button></div><div id="duels" class="home"><div class="empty">불러오는 중…</div></div></div>`;
  $('#newDuel', el).onclick = () => openDuelCreate();
  const list = await run(() => api.rpc('my_duels'));
  if (!list) return;
  const box = $('#duels', el);
  if (!list.length) { box.innerHTML = '<div class="empty">아직 대결이 없어요. 랭킹에서 친구를 눌러 도전장을 보내 보세요.</div>'; return; }
  const status = (d) => {
    if (d.status === 'done') return d.winner === 'draw' ? '무승부' : `나 ${d.my_wrong}개, 상대 ${d.their_wrong}개 오답`;
    if (d.status === 'declined') return '상대가 거절했어요';
    if (d.status === 'expired') return '기간(3일)이 지나 만료됐어요';
    if (d.role === 'opponent' && d.status === 'pending') return `${LEVELS[d.level].name}, 12문제 도전이 왔어요`;
    if (!d.my_played) return `${LEVELS[d.level].name}, 내 차례예요`;
    return '상대가 푸는 중이에요';
  };
  const tile = (d) => {
    if (d.status === 'done') return d.winner === 'me' ? '<span class="duel-tile win"><b>승</b><small>승리</small></span>' : d.winner === 'them' ? '<span class="duel-tile lose"><b>패</b><small>패배</small></span>' : '<span class="duel-tile lose"><b>무</b><small>무승부</small></span>';
    if (['declined', 'expired'].includes(d.status)) return '<span class="duel-tile lose"><b>끝</b><small>종료</small></span>';
    if (d.my_played) return '<span class="duel-tile wait"><b>…</b><small>대기</small></span>';
    return '<span class="duel-tile"><b>VS</b><small>12문제</small></span>';
  };
  const acts = (d) => {
    if (d.role === 'opponent' && d.status === 'pending') return `<button class="btn primary small" data-acc="${d.id}">수락</button><button class="btn small" data-dec="${d.id}">거절</button>`;
    if (['pending', 'active'].includes(d.status) && !d.my_played) return `<button class="btn primary small" data-play="${d.id}">풀기</button>`;
    return '';
  };
  const card = (d) => `<div class="duel-card">${tile(d)}
    <div class="row-main"><span class="row-title">${d.role === 'challenger' ? '보낸 도전' : '받은 도전'}: ${esc(d.other.display_name)} <span class="chip">${tierSpan(d.other.tier, d.other.div)}</span></span><span class="row-sub">${status(d)}</span></div>
    <div class="acts">${acts(d)}</div></div>`;
  const groups = [
    ['sec-orange', '할 일', '수락하거나 풀어야 하는 대결이에요.', list.filter((d) => ['pending', 'active'].includes(d.status) && !d.my_played)],
    ['sec-teal', '결과 기다리는 중', '상대가 풀면 결과가 나와요.', list.filter((d) => ['pending', 'active'].includes(d.status) && d.my_played)],
    ['sec-blue', '끝난 대결', '최근 30개까지 보여요.', list.filter((d) => !['pending', 'active'].includes(d.status))],
  ];
  box.innerHTML = groups.filter(([, , , l]) => l.length).map(([cls, title, desc, l]) => `<section class="sec ${cls}"><div class="sec-head"><div><h2>${title}</h2><p>${desc}</p></div></div>
    <div class="rows">${l.map(card).join('')}</div></section>`).join('');
  const find = (id) => list.find((d) => d.id === id);
  $$('[data-play]', box).forEach((b) => (b.onclick = () => openStartSheet('duel', find(b.dataset.play))));
  $$('[data-acc]', box).forEach((b) => (b.onclick = () => run(async () => {
    const d = await api.rpc('respond_duel', { p_duel: b.dataset.acc, p_accept: true });
    fx.sfx.slam();
    openStartSheet('duel', d);
  }, b)));
  $$('[data-dec]', box).forEach((b) => (b.onclick = () => run(async () => {
    await api.rpc('respond_duel', { p_duel: b.dataset.dec, p_accept: false });
    await loadMe(); render();
  }, b)));
}

// ---------------- 내 정보 ----------------
function renderMe(el) {
  const p = S.me.profile, sc = p.school || {};
  const sys = sc.sys || 5;
  const theme = store.get('st_theme') || 'auto';
  const opts = (n, sel) => `<option value="">입력 안 함</option>` + Array.from({ length: n }, (_, i) => `<option value="${i + 1}" ${Number(sel) === i + 1 ? 'selected' : ''}>${i + 1}등급</option>`).join('');
  el.innerHTML = `<div class="home">
  <div class="home-head"><div><p class="eyebrow">공부 티어 · 내 정보</p><h1>${esc(p.display_name)}</h1></div><div class="stats"><div class="stat">@${esc(p.username)}</div></div></div>
  <div class="cols">
    <section class="sec sec-green"><div class="sec-head"><div><h2>프로필</h2><p>랭킹과 대결에 보이는 이름이에요.</p></div></div>
      <form class="card form" id="profForm">
        <div class="field"><label for="m-dn">닉네임</label><input id="m-dn" name="display_name" maxlength="12" value="${esc(p.display_name)}" required></div>
        <div class="field"><label for="m-gc">반 코드</label><input id="m-gc" name="group_code" maxlength="20" value="${esc(p.group_code || '')}" placeholder="예: 2-3"><p class="hint">같은 코드끼리 반 랭킹을 볼 수 있어요</p></div>
        <button class="btn primary" type="submit">프로필 저장</button>
      </form></section>
    <section class="sec sec-blue" id="schoolSec"><div class="sec-head"><div><h2>학교 성적</h2><p>학업 지수로 바뀌어 배치고사, LP 보정(최대 ±8), 정성평가에 반영돼요.</p></div>${p.a10 != null ? `<span class="stat"><b>${(p.a10 / 10).toFixed(1)}</b>학업 지수</span>` : ''}</div>
      <form class="card form" id="schForm">
        <div class="field"><label for="m-sc">최근 수학 시험 점수 (0~100)</label><input id="m-sc" type="number" inputmode="numeric" name="score" min="0" max="100" value="${sc.score ?? ''}"></div>
        <div class="form-row">
          <div class="field"><label for="sysSel">내신 등급제</label><select name="sys" id="sysSel"><option value="5" ${sys === 5 ? 'selected' : ''}>5등급제</option><option value="9" ${sys === 9 ? 'selected' : ''}>9등급제</option></select></div>
          <div class="field"><label for="gradeSel">수학 내신 등급</label><select name="grade" id="gradeSel">${opts(sys, sc.grade)}</select></div>
        </div>
        <p class="hint">2025년 고1부터는 5등급제예요.</p>
        <div class="field"><label for="m-mk">모의고사 수학 등급</label><select id="m-mk" name="mock">${opts(9, sc.mock)}</select></div>
        <label class="check"><input type="checkbox" name="show" ${p.show_school ? 'checked' : ''}> 친구들에게 학업 지수 공개</label>
        <button class="btn primary" type="submit">성적 저장</button>
      </form></section>
  </div>
  <section class="sec sec-plain"><div class="sec-head"><div><h2>화면과 효과</h2></div></div>
    <div class="card form">
      <div class="field"><span class="label">화면 테마</span><div class="seg" role="group" aria-label="화면 테마">
        ${[['auto', '기기 설정'], ['light', '밝게'], ['dark', '어둡게']].map(([k, l]) => `<button data-theme="${k}" aria-pressed="${theme === k}">${l}</button>`).join('')}</div></div>
      <label class="check"><input type="checkbox" id="optSound" ${fx.settings.sound ? 'checked' : ''}> 효과음</label>
      <label class="check"><input type="checkbox" id="optMotion" ${fx.settings.motion ? 'checked' : ''}> 애니메이션과 파티클 (끄면 배터리 절약)</label>
    </div></section>
  <section class="sec sec-teal"><div class="sec-head"><div><h2>규칙</h2><p>티어, LP, 승급전과 강등전, 성적 반영 방식이에요.</p></div></div><div class="card">${rulesHtml()}</div></section>
  <div class="cta-row"><button class="btn danger" id="logout">${DEMO ? '체험 종료' : '로그아웃'}</button>${DEMO ? '<button class="btn" id="reset">체험 기록 초기화</button>' : ''}</div>
  </div>`;
  $('#profForm', el).onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    run(async () => { S.me = await api.rpc('update_profile', { p_display_name: f.display_name, p_group_code: f.group_code }); toast('프로필을 저장했어요.'); render(); }, $('button', e.target));
  };
  $('#sysSel', el).onchange = (e) => { $('#gradeSel', el).innerHTML = opts(Number(e.target.value), null); };
  $('#schForm', el).onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const num = (k) => (f.get(k) === '' || f.get(k) == null ? null : Number(f.get(k)));
    const score = num('score');
    if (score != null && (score < 0 || score > 100)) return toast('점수는 0~100 사이로 입력하세요.', true);
    run(async () => {
      S.me = await api.rpc('set_school', { p_score: score, p_grade: num('grade'), p_sys: Number(f.get('sys')), p_mock: num('mock'), p_show: f.get('show') === 'on' });
      toast(S.me.profile.a10 != null ? `저장했어요. 학업 지수 ${(S.me.profile.a10 / 10).toFixed(1)}` : '저장했어요.');
      render();
    }, $('button[type=submit]', e.target));
  };
  $$('[data-theme]', el).forEach((b) => (b.onclick = () => { store.set('st_theme', b.dataset.theme); applyThemeMode(); render(); }));
  $('#optSound', el).onchange = (e) => { fx.setSetting('sound', e.target.checked); if (e.target.checked) fx.sfx.mark(); };
  $('#optMotion', el).onchange = (e) => { fx.setSetting('motion', e.target.checked); document.body.classList.toggle('no-motion', !e.target.checked); };
  $('#logout', el).onclick = async () => { await api.signOut(); S.me = null; renderAuth(); };
  $('#reset', el)?.addEventListener('click', async () => {
    if (!(await confirmSheet('체험 기록을 지울까요?', '이 기기에 저장된 체험 기록이 모두 사라져요.', '초기화', true))) return;
    await api.reset(); S.me = null; renderAuth();
  });
}

function rulesHtml() {
  return `<div class="rules">
    <div class="ladder-row" aria-label="티어 순서">${TIERS.map((_, i) => emblemSVG(i, { size: 52 })).join('')}</div>
    <p>아이언부터 다이아몬드까지는 IV → I 네 단계, 마스터 이상은 LP로만 구분해요. 마스터 300 LP에서 그랜드마스터, 600 LP에서 챌린저 승급전이 열려요.</p>
    <h3>한 판의 흐름</h3>
    <ul><li>티어가 높을수록 풀 문제가 많아져요 (아이언 10문제 ~ 챌린저 20문제).</li>
      <li>내 문제집으로 풀고 답지로 채점해 O/X를 입력해요. 문제당 최소 ${RULES.minSecPerProblem}초가 지나야 제출돼요.</li>
      <li>정직하게 채점해야 진짜 실력이 티어에 드러나요.</li></ul>
    <h3>문제집 수준</h3>
    <table><tr><th>수준</th><th>승리 조건</th><th>획득 LP</th></tr>
      ${LEVELS.slice(1).map((L) => `<tr><td>${L.name}</td><td>오답률 ${L.win}% 이하</td><td class="mono">×${(L.mult / 100).toFixed(2)}</td></tr>`).join('')}</table>
    <h3>결과와 LP</h3>
    <ul><li>모두 정답이면 PERFECT(+28 기준), 여유 있게 이기면 승리(+22), 아슬아슬하면 신승(+16).</li>
      <li>조금 넘치면 석패(-14), 많이 틀리면 패배(-20). 포기하거나 3시간 안에 제출하지 않으면 탈주(-25)예요.</li>
      <li>3연승부터 판마다 +3 보너스가 붙어요.</li></ul>
    <h3>승급전과 강등전</h3>
    <ul><li>100 LP를 채우면 승급전이 시작돼요. 같은 티어 안에서는 3판 2선승, 다음 티어로 올라갈 때는 5판 3선승이에요.</li>
      <li>승급하면 ${RULES.shieldGames}판 동안 강등 보호가 걸려요.</li>
      <li>0 LP에서 또 지면 강등전(3판 2선승)이 시작되고, 2판을 지면 강등돼요.</li></ul>
    <h3>학교 성적과 정성평가</h3>
    <ul><li>점수, 내신 등급, 모의고사 등급을 학업 지수로 바꿔 숨은 실력 점수(MMR)에 20% 반영해요.</li>
      <li>MMR이 지금 티어보다 높으면 이길 때 LP를 더 받고 질 때 덜 잃어요 (최대 ±8).</li>
      <li>정성평가는 정확도, 도전(문제집 수준), 꾸준함(최근 2주 공부한 날), 성장세, 학교 성적을 종합한 등급이에요.</li></ul>
  </div>`;
}

addEventListener('visibilitychange', () => { if (!document.hidden && S.play) updateHint(); });
boot();
