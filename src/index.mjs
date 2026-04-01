import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = process.env.STATE_PATH?.trim() || resolve(ROOT_DIR, 'state.json');
const MONTHS = 36;

const SOURCES = [
  { key: 'tesla', name: 'Tesla Sverige', url: 'https://www.tesla.com/sv_se', match: ['lagerbil', 'ränta', 'leasing', 'kr', '%'] },
  { key: 'xpeng', name: 'Xpeng Sverige', url: 'https://www.xpeng.com/se', match: ['kampanj', 'ränta', 'leasing', 'kr', '%'] },
  { key: 'byd', name: 'BYD Sverige', url: 'https://www.bydauto.se/', match: ['erbjudande', 'ränta', 'leasing', 'kr', '%'] },
  { key: 'kia', name: 'Kia Sverige', url: 'https://www.kia.com/se', match: ['erbjudande', 'kampanj', 'ränta', 'kr', '%'] },
  { key: 'regeringen', name: 'Regeringen (elbilspremie)', url: 'https://www.regeringen.se/', match: ['elbilspremie', 'elbil', 'stöd', 'bonus'] },
  { key: 'transportstyrelsen', name: 'Transportstyrelsen (elbilspremie)', url: 'https://www.transportstyrelsen.se/sv/vagtrafik/Fordon/Fordonsrelaterade-skulder-och-avgifter/bonus-malus/', match: ['bonus', 'malus', 'premie', 'elbil'] },
];

const normalize = (s) => s.replace(/\s+/g, ' ').trim();
const stripHtml = (html) => normalize(html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&'));

function pickRelevantLines(text, terms) {
  const lines = text.split(/(?<=[.!?])\s+/);
  const out = [];
  for (const line of lines) {
    const l = line.toLowerCase();
    if (!terms.some((t) => l.includes(t.toLowerCase()))) continue;
    if (!/(\d+[\d\s.,]*\s?(kr|sek|:-)|\d+[,.]?\d*\s?%)/i.test(line)) continue;
    const clean = normalize(line);
    if (clean.length >= 20 && clean.length <= 240) out.push(clean);
    if (out.length >= 8) break;
  }
  return out;
}

function extractNumbers(lines) {
  const nums = [];
  for (const line of lines) {
    const re = /(\d[\d\s.]*(?:,\d+)?)(?=\s?(kr|sek|:-|%))/gi;
    let m;
    while ((m = re.exec(line))) {
      const n = Number(m[1].replace(/\s|\./g, '').replace(',', '.'));
      if (Number.isFinite(n)) nums.push(n);
    }
  }
  return nums.sort((a, b) => a - b);
}

function tcoImpact(prevLines = [], currLines = []) {
  const prev = extractNumbers(prevLines);
  const curr = extractNumbers(currLines);
  if (!prev.length || !curr.length) return 'TCO: ej kvantifierbar (saknar jämförbara nivåer).';

  const delta = curr[0] - prev[0];
  if (Math.abs(delta) < 1) return 'TCO: i praktiken oförändrad.';

  const perMonth = Math.round(Math.abs(delta));
  const over36 = Math.round(Math.abs(delta) * MONTHS);
  const direction = delta > 0 ? 'dyrare' : 'billigare';
  return `TCO (ca): ${perMonth.toLocaleString('sv-SE')} kr/mån ${direction}, ~${over36.toLocaleString('sv-SE')} kr över ${MONTHS} månader.`;
}

async function loadState() {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { sources: {} };
  }
}

async function saveState(state) {
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: {
      'user-agent': 'ev-price-watcher-se/0.1',
      'accept-language': 'sv-SE,sv;q=0.9,en;q=0.8',
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  const text = stripHtml(html);
  const lines = pickRelevantLines(text, source.match);
  const canonical = lines.join('\n');

  return {
    updatedAt: new Date().toISOString(),
    lines,
    hash: createHash('sha256').update(canonical).digest('hex')
  };
}

async function notify(message) {
  console.log(message);
  if (!process.env.WEBHOOK_URL) return;
  await fetch(process.env.WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: message })
  });
}

async function run() {
  const prev = await loadState();
  const next = { sources: { ...(prev.sources || {}) } };
  const changes = [];

  for (const source of SOURCES) {
    try {
      const now = await fetchSource(source);
      const old = prev.sources?.[source.key];
      next.sources[source.key] = now;

      if (!old || old.hash !== now.hash) {
        changes.push([
          `• ${source.name}: ändring upptäckt`,
          `  Länk: ${source.url}`,
          `  Nytt: ${now.lines.slice(0, 3).join(' | ') || 'Inga pris/ränta-rader hittades.'}`,
          `  ${tcoImpact(old?.lines, now.lines)}`,
        ].join('\n'));
      }
    } catch (err) {
      changes.push([
        `• ${source.name}: kunde inte uppdatera (${err instanceof Error ? err.message : 'okänt fel'})`,
        `  Länk: ${source.url}`,
      ].join('\n'));
    }
  }

  await saveState(next);

  if (!changes.length) {
    console.log('Inga ändringar sedan senaste körningen.');
    return;
  }

  const message = [`Kort bevakningssammanfattning (${new Date().toLocaleString('sv-SE')})`, ...changes].join('\n\n');
  await notify(message);
}

run().catch((err) => {
  console.error('Watcher misslyckades:', err);
  process.exitCode = 1;
});