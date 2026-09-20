// design/tokens.json → src/app/tokens.css
// 디자인 시스템(claude.ai/artifact/LVMkUK7SapfQM8XLGDqMeP)이 진실의 출처다.
// tokens.json 을 새로 받아 오면 이 스크립트를 다시 돌린다.
import { readFileSync, writeFileSync } from 'node:fs';

const t = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url)));
const themes = t.color.themes.map((x) => x.id);
const [primary] = themes;

const alias = (v) => {
  // "{other-token}" 은 다른 토큰을 가리킨다 → var(--other-token)
  const m = typeof v === 'string' && v.match(/^\{([A-Za-z0-9_.-]+)\}$/);
  return m ? `var(--${m[1]})` : v;
};

const resolve = (value, theme) => {
  if (typeof value === 'string') return alias(value);
  return alias(value[theme] ?? value[primary]);
};

const colorVars = (theme) =>
  t.color.tokens.map((tok) => `  --${tok.name}: ${resolve(tok.value, theme)};`).join('\n');

const scalar = ['spacing', 'radius', 'size', 'shadow']
  .filter((k) => t[k])
  .flatMap((k) => t[k].tokens.map((tok) => [tok.name, tok.value]));

const scalarVars = (theme) =>
  scalar.map(([name, value]) => `  --${name}: ${resolve(value, theme)};`).join('\n');

const families = Object.entries(t.type.families)
  .map(([k, v]) => `  --font-${k}: ${v};`)
  .join('\n');

const styles = t.type.groups
  .flatMap((g) => g.styles.map((s) => [s, g.family]))
  .map(([s, family]) => {
    const ls = s.letterSpacing ? `\n  --text-${s.name}-tracking: ${s.letterSpacing};` : '';
    return `  --text-${s.name}: ${s.fontWeight} ${s.fontSize}/${s.lineHeight} var(--font-${family});${ls}`;
  })
  .join('\n');

const faces = t.type.fonts
  .map(
    (f) => `@font-face {
  font-family: "${f.family}";
  src: url("/fonts/${f.file.split('/').pop()}") format("woff2");
  font-weight: ${f.weight};
  font-style: ${f.style ?? 'normal'};
  font-display: swap;
}`
  )
  .join('\n');

const css = `/* 자동 생성 — 고치지 말 것. design/tokens.json 을 고치고 \`npm run tokens\` */

${faces}

:root, [data-theme="${primary}"] {
${colorVars(primary)}
${scalarVars(primary)}
${families}
${styles}
}

${themes
  .slice(1)
  .map(
    (theme) => `@media (prefers-color-scheme: ${theme}) {
  :root:not([data-theme="${primary}"]) {
${colorVars(theme)}
${scalarVars(theme)}
  }
}

[data-theme="${theme}"] {
${colorVars(theme)}
${scalarVars(theme)}
}`
  )
  .join('\n\n')}
`;

writeFileSync(new URL('../src/app/tokens.css', import.meta.url), css);
console.log(`tokens.css — 색 ${t.color.tokens.length} · 스칼라 ${scalar.length} · 글자 스타일 ${t.type.groups.flatMap((g) => g.styles).length}`);
