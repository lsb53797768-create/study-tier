// 규칙 엔진 자체 테스트: node scripts/test-rules.mjs
import { applyRanked, placement, classify, academic10, floorLP, ceilLP, tierLabel, evaluate, maxWrongToWin } from '../js/rules.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL:', m); } };

// 판정 기준
ok(classify(0, 10, 2) === 'perfect', 'perfect');
ok(classify(3, 10, 2) === 'close_win', '3/10 유형 = 신승');
ok(classify(4, 10, 2) === 'close_loss', '4/10 유형 = 석패');
ok(classify(4, 10, 4) === 'close_win', '4/10 심화 = 신승');
ok(classify(2, 10, 1) === 'close_win', '2/10 개념 = 신승');
ok(classify(3, 10, 1) === 'close_loss', '3/10 개념 = 석패');
ok(maxWrongToWin(14, 2) === 4, 'maxWrong 14 유형');

// 학업 지수
ok(academic10({ score: 90, grade: 2, sys: 5, mock: 3 }) === Math.floor((3 * 90 + 4 * 78 + 3 * 83) * 10 / 10 + 0.5), 'academic');
ok(academic10({}) === null, 'academic empty');

// 배치
const pl = placement(15, 0, 4, null);
ok(pl.tier === 4 && pl.div === 4, '배치 최고는 플래티넘 IV: ' + JSON.stringify(pl));
const pl2 = placement(15, 15, 1, null);
ok(pl2.tier === 0 && pl2.div === 4 && pl2.lp === 0, '배치 최저');

// 무작위 시뮬레이션: 불변식 확인
let rnd = 12345;
const r = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
let maxTier = 0, promos = 0, demos = 0;
for (let run = 0; run < 300; run++) {
  let st = { ...placement(15, Math.floor(r() * 16), 1 + Math.floor(r() * 4), r() < 0.5 ? null : Math.floor(r() * 1000)), series: null, shield: 0, streak: 0, wins: 0, losses: 0 };
  st.a10 = r() < 0.5 ? null : Math.floor(r() * 1000);
  const skill = r();
  for (let g = 0; g < 400; g++) {
    const n = 10 + Math.floor(r() * 11);
    const level = 1 + Math.floor(r() * 4);
    const wrong = Math.min(n, Math.floor(n * (1 - skill) * r() * 1.2));
    const res = applyRanked(st, n, wrong, level, r() < 0.01);
    st = res.state;
    if (res.events.includes('promoted')) promos++;
    if (res.events.includes('demoted')) demos++;
    ok(st.tier >= 0 && st.tier <= 9, 'tier range');
    ok(st.tier < 7 ? st.div >= 1 && st.div <= 4 : st.div === 0, 'div range ' + JSON.stringify(st));
    ok(st.lp >= floorLP(st.tier) && st.lp <= ceilLP(st.tier), 'lp range ' + JSON.stringify(st));
    ok(!st.series || st.lp === (st.series.type === 'promo' ? ceilLP(st.tier) : floorLP(st.tier)), 'series lp ' + JSON.stringify(st));
    maxTier = Math.max(maxTier, st.tier);
  }
}
ok(maxTier === 9, '챌린저 도달 가능');
console.log('promotions', promos, 'demotions', demos, 'max tier', tierLabel(maxTier, 1));

// 승급전 시나리오: 실버 II 99LP -> 승리 -> 승급전 시작 -> 2승 -> 실버 I
let s = { tier: 2, div: 2, lp: 95, mmr: 1000, series: null, shield: 0, streak: 0, wins: 0, losses: 0, a10: null };
let x = applyRanked(s, 12, 0, 2); ok(x.events[0] === 'promo_start' && x.state.lp === 100, 'promo start');
x = applyRanked(x.state, 12, 6, 2); ok(x.events[0] === 'promo_progress', 'promo progress');
x = applyRanked(x.state, 12, 1, 2); ok(x.events[0] === 'promo_progress', 'promo progress 2');
x = applyRanked(x.state, 12, 1, 2); ok(x.events[0] === 'promoted' && x.state.div === 1 && x.state.shield === 3, 'promoted ' + JSON.stringify(x.state));
// 강등 보호: 0LP에서 져도 보호
x = applyRanked(x.state, 12, 12, 2); ok(x.state.lp === 0 && !x.state.series && x.events.includes('shield_used'), 'shield ' + JSON.stringify(x));
// 보호 3판 소진 후 강등전
x = applyRanked(x.state, 12, 12, 2); x = applyRanked(x.state, 12, 12, 2); ok(x.state.shield === 0, 'shield gone');
x = applyRanked(x.state, 12, 12, 2);
ok(x.state.series && x.state.series.type === 'demote', 'demote start ' + JSON.stringify(x));
x = applyRanked(x.state, 12, 12, 2); x = applyRanked(x.state, 12, 12, 2);
ok(x.events[0] === 'demoted' && x.state.div === 2 && x.state.lp === 75, 'demoted ' + JSON.stringify(x));

// 정성평가
const ev = evaluate([{ n: 10, wrong: 1, level: 3, mmr_after: 900, finished_at: new Date().toISOString() }, { n: 10, wrong: 3, level: 2, mmr_after: 800, finished_at: new Date().toISOString() }], 950, 700);
ok(ev && ev.grade, 'eval');
console.log('eval sample', ev);

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
