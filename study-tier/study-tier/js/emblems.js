// 티어 엠블럼: 랭크 게임의 문장(紋章) 구조(방패 → 날개 → 왕관)를 참고해
// 앱 UI에 맞게 납작한 아이콘 스타일로 직접 그린 SVG입니다. (외부 이미지 없음)
import { TIERS } from './rules.js';

let uid = 0;

const BODY = {
  shieldA: 'M100 34 L148 48 L148 100 Q148 138 100 168 Q52 138 52 100 L52 48 Z',
  shieldB: 'M100 28 L154 44 L151 104 Q144 144 100 172 Q56 144 49 104 L46 44 Z',
  crest:   'M100 22 L150 46 L150 118 L100 176 L50 118 L50 46 Z',
  star:    'M100 16 L142 38 L162 88 L134 148 L100 180 L66 148 L38 88 L58 38 Z',
};
// 몸체 위쪽 하이라이트 (빛 반사 대신 납작한 면)
const SHINE = {
  shieldA: 'M100 34 L148 48 L148 64 L100 52 L52 64 L52 48 Z',
  shieldB: 'M100 28 L154 44 L153.4 60 L100 46 L46.6 60 L46 44 Z',
  crest:   'M100 22 L150 46 L150 60 L100 38 L50 60 L50 46 Z',
  star:    'M100 16 L142 38 L148 52 L100 32 L52 52 L58 38 Z',
};
const GEM = {
  0: '<circle cx="100" cy="100" r="15"/>',
  1: '<rect x="86" y="86" width="28" height="28" rx="5" transform="rotate(45 100 100)"/>',
  2: '<path d="M100 72 L121 100 L100 130 L79 100 Z"/>',
  3: '<path d="M100 70 L108 92 L131 92 L113 106 L120 129 L100 115 L80 129 L87 106 L69 92 L92 92 Z"/>',
  4: '<path d="M100 72 L124 86 L124 114 L100 128 L76 114 L76 86 Z"/>',
  5: '<path d="M88 72 L112 72 L128 88 L128 112 L112 128 L88 128 L72 112 L72 88 Z"/>',
  6: '<path d="M78 88 L90 74 L110 74 L122 88 L100 130 Z"/>',
  7: '<circle cx="100" cy="102" r="22"/>',
  8: '<path d="M100 66 L124 100 L100 136 L76 100 Z"/>',
  9: '<path d="M100 64 L108 90 L134 82 L114 100 L134 118 L108 110 L100 136 L92 110 L66 118 L86 100 L66 82 L92 90 Z"/>',
};
const GEM_FACET = {
  2: 'M100 72 L121 100 L100 100 Z', 4: 'M100 72 L124 86 L100 100 Z', 5: 'M88 72 L112 72 L100 100 Z',
  6: 'M90 74 L110 74 L100 88 Z', 8: 'M100 66 L124 100 L100 100 Z',
};
const WING_S = 'M148 62 C168 54 182 44 188 28 C186 46 172 62 150 74 Z M150 80 C172 76 188 66 196 52 C190 70 172 84 150 90 Z';
const WING_M = 'M146 54 C172 40 188 24 192 4 C192 30 176 50 150 66 Z M150 72 C180 64 198 48 204 28 C202 54 182 72 152 84 Z M150 90 C182 88 202 76 212 58 C206 82 184 96 150 102 Z M146 108 C172 112 194 106 206 92 C198 112 172 120 146 118 Z';
const WING_L = 'M142 46 C170 28 188 8 190 -14 C194 16 176 42 148 60 Z M148 64 C182 52 204 32 212 6 C214 38 190 64 152 78 Z M150 82 C190 78 214 62 226 36 C224 68 196 90 152 96 Z M150 100 C190 104 216 94 230 74 C222 100 192 114 150 114 Z M144 118 C176 128 202 126 218 112 C206 132 174 138 144 130 Z';

const mirror = (inner) => `${inner}<g transform="translate(200 0) scale(-1 1)">${inner}</g>`;

function laurel(fill, stroke) {
  let s = '';
  for (let i = 0; i < 7; i++) {
    const a = 200 + i * 15, rad = (a * Math.PI) / 180;
    const x = 100 + Math.cos(rad) * 70, y = 112 - Math.sin(rad) * 64;
    s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="4.2" transform="rotate(${(-a + 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  return `<g fill="${fill}" stroke="${stroke}" stroke-width="1.5">${mirror(s)}</g>`;
}
function rays(c1, c2, n = 18) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, l = i % 2 ? 84 : 98;
    const p = (r, da) => `${(100 + Math.cos(a + da) * r).toFixed(1)} ${(100 + Math.sin(a + da) * r).toFixed(1)}`;
    s += `<path fill="${i % 2 ? c2 : c1}" d="M${p(40, -0.09)} L${p(l, 0)} L${p(40, 0.09)} Z"/>`;
  }
  return `<g class="em-rays">${s}</g>`;
}

export function emblemSVG(tier, { size = 160, className = '' } = {}) {
  const id = `em${++uid}`;
  if (tier == null) {
    return `<svg class="emblem ${className}" viewBox="-20 -20 240 240" width="${size}" height="${size}" aria-label="배치 전">
      <path d="${BODY.shieldA}" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="5" stroke-dasharray="10 8" stroke-linejoin="round"/>
      <text x="100" y="120" text-anchor="middle" font-size="56" font-weight="700" fill="currentColor" fill-opacity=".5" font-family="IBM Plex Mono, monospace">?</text></svg>`;
  }
  const t = TIERS[tier];
  const key = tier <= 1 ? 'shieldA' : tier <= 3 ? 'shieldB' : tier <= 5 ? 'crest' : 'star';
  const body = BODY[key];
  const sw = 'stroke-linejoin="round"';
  let back = '', front = '';
  if (tier === 9) back += rays(t.color, t.c2);
  if (tier >= 8) back += `<circle cx="100" cy="100" r="82" fill="${t.glow}" opacity=".55"/>`;
  const wing = tier >= 7 ? WING_L : tier >= 5 ? WING_M : tier >= 2 ? WING_S : null;
  if (wing) back += `<g fill="${tier === 9 ? t.glow : t.color}" stroke="${t.c2}" stroke-width="2.5" ${sw}>${mirror(`<path d="${wing}"/>`)}</g>`;
  if (tier === 3 || tier === 4) back += laurel(t.glow, t.c2);
  if (tier === 1) front += [70, 130].map((x) => `<circle cx="${x}" cy="58" r="4.5" fill="${t.glow}" stroke="${t.c2}" stroke-width="1.5"/>`).join('');
  if (tier >= 7) {
    const h = tier === 8 ? 'M64 42 L60 6 L80 30 L90 14 L100 2 L110 14 L120 30 L140 6 L136 42 Z' : 'M68 42 L72 14 L86 30 L100 6 L114 30 L128 14 L132 42 Z';
    front += `<path d="${h}" fill="${tier === 9 ? t.color : t.glow}" stroke="${t.c2}" stroke-width="3" ${sw}/>`;
    front += `<circle cx="100" cy="${tier === 8 ? 16 : 20}" r="5" fill="#fff" stroke="${t.c2}" stroke-width="2"/>`;
  }
  if (tier === 9) front += `<circle cx="100" cy="102" r="34" fill="none" stroke="${t.glow}" stroke-width="3"/>`;

  return `<svg class="emblem tier-${t.key} ${className}" viewBox="-20 -20 240 240" width="${size}" height="${size}" aria-label="${t.name} 엠블럼">
  <defs><clipPath id="${id}c"><path d="${body}"/></clipPath></defs>
  ${back}
  <path d="${body}" fill="${t.color}" stroke="${t.c2}" stroke-width="4" ${sw}/>
  <path d="${SHINE[key]}" fill="#fff" opacity=".28" clip-path="url(#${id}c)"/>
  <path d="${body}" fill="${t.c2}" transform="translate(100 100) scale(.72) translate(-100 -100)"/>
  <g fill="${t.glow}" stroke="#fff" stroke-width="2.5" ${sw}>${GEM[tier]}</g>
  ${GEM_FACET[tier] ? `<path d="${GEM_FACET[tier]}" fill="#fff" opacity=".45"/>` : ''}
  ${front}
</svg>`;
}
