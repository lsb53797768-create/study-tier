// JS 규칙(js/rules.js)과 서버 SQL(_rank_step, _placement, _classify, _academic10)이
// 같은 결과를 내는지 비교하는 SQL 파일을 만듭니다.
// 사용: node scripts/test-parity.mjs > /tmp/parity.sql && psql ... -f /tmp/parity.sql
import { applyRanked, placement, classify, academic10 } from '../js/rules.js';

let seed = 987654;
const r = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const q = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const rows = [];
const prow = [];
const crow = [];
const arow = [];

for (let run = 0; run < 120; run++) {
  const pn = 15, pw = Math.floor(r() * 16), pl = 1 + Math.floor(r() * 4), pa = r() < 0.5 ? null : Math.floor(r() * 1000);
  const P = placement(pn, pw, pl, pa);
  prow.push(`(${pn},${pw},${pl},${pa ?? 'null'},${q(P)})`);
  let st = { tier: P.tier, div: P.div, lp: P.lp, mmr: P.mmr, series: null, shield: 0, streak: 0, wins: 0, losses: 0, a10: pa };
  const skill = r();
  for (let g = 0; g < 120; g++) {
    const n = 10 + Math.floor(r() * 11), level = 1 + Math.floor(r() * 4);
    const wrong = Math.min(n, Math.floor(n * (1 - skill) * r() * 1.3));
    const forfeit = r() < 0.02;
    const res = applyRanked(st, n, wrong, level, forfeit);
    rows.push(`(${q(st)},${n},${wrong},${level},${forfeit},${q(res)})`);
    st = res.state;
  }
}
for (let i = 0; i < 400; i++) {
  const n = 10 + Math.floor(r() * 11), w = Math.floor(r() * (n + 1)), l = 1 + Math.floor(r() * 4);
  crow.push(`(${w},${n},${l},'${classify(w, n, l)}')`);
}
for (let i = 0; i < 200; i++) {
  const sc = {};
  if (r() < 0.7) sc.score = Math.floor(r() * 101);
  if (r() < 0.7) { sc.sys = r() < 0.5 ? 5 : 9; sc.grade = 1 + Math.floor(r() * sc.sys); }
  if (r() < 0.7) sc.mock = 1 + Math.floor(r() * 9);
  arow.push(`(${q(sc)},${academic10(sc) ?? 'null'})`);
}

console.log(`
create temp table rc(st jsonb, n int, w int, l int, f boolean, exp jsonb);
insert into rc values ${rows.join(',\n')};
create temp table pc(n int, w int, l int, a int, exp jsonb);
insert into pc values ${prow.join(',\n')};
create temp table cc(w int, n int, l int, exp text);
insert into cc values ${crow.join(',\n')};
create temp table ac(s jsonb, exp int);
insert into ac values ${arow.join(',\n')};
select 'rank_step' as fn, count(*) as cases, count(*) filter (where public._rank_step(st, n, w, l, f) <> exp) as mismatches from rc
union all select 'placement', count(*), count(*) filter (where public._placement(n, w, l, a) <> exp) from pc
union all select 'classify', count(*), count(*) filter (where public._classify(w, n, l) <> exp) from cc
union all select 'academic10', count(*), count(*) filter (where public._academic10(s) is distinct from exp) from ac;
select st, n, w, l, f, exp, public._rank_step(st, n, w, l, f) as got from rc where public._rank_step(st, n, w, l, f) <> exp limit 3;
`);
