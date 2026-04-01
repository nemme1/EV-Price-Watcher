import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = process.env.STATE_PATH?.trim() || resolve(ROOT_DIR, 'state.json');
const MONTHS = 36;

export const SOURCES = [
  { key: 'tesla', name: 'Tesla Sverige', url: 'https://www.tesla.com/sv_se', match: ['lagerbil', 'ränta', 'leasing', 'kr', '%'] },
  {
    key: 'xpeng',
    name: 'Xpeng Sverige',
    url: 'https://www.xpeng.com/se',
    urls: [
      'https://www.xpeng.com/se',
      'https://www.xpeng.com/se/finance',
      'https://www.xpeng.com/se/quick-delivery',
      'https://www.xpeng.com/se/campaign/p7plus-kampanj',
    ],
    match: ['kampanj', 'ränta', 'leasing', 'kr', '%'],
    emptyHint: 'Vissa undersidor är JS-renderade, men bevakning körs nu på flera kampanj-/finance-sidor.',
  },
  {
    key: 'byd',
    name: 'BYD Sverige',
    url: 'https://www.byd.com/se',
    urls: [
      'https://www.byd.com/se',
      'https://www.byd.com/se/kampanj',
      'https://www.byd.com/se/electric-cars/atto-3-evo.html',
    ],
    match: ['erbjudande', 'ränta', 'leasing', 'kr', '%'],
    emptyHint: 'BYD-sidor bevakas via flera svenska undersidor för kampanj och modellpris.',
  },
  {
    key: 'kia',
    name: 'Kia Sverige',
    url: 'https://www.kia.com/se/kopa/erbjudanden/',
    urls: ['https://www.kia.com/se/kopa/erbjudanden/', 'https://www.kia.com/se'],
    match: ['erbjudande', 'kampanj', 'ränta', 'kr', '%'],
  },
  {
    key: 'regeringen',
    name: 'Regeringen (elbilspremie)',
    url: 'https://www.regeringen.se/',
    urls: ['https://www.regeringen.se/', 'https://www.regeringen.se/pressmeddelanden/'],
    match: ['elbilspremie', 'elbil', 'stöd', 'bonus', 'premie', 'bidrag', 'pressmeddelande'],
    emptyHint: 'Regeringen bevakas på startsida och pressmeddelanden för policyändringar.',
  },
  {
    key: 'transportstyrelsen',
    name: 'Transportstyrelsen (elbilspremie)',
    url: 'https://www.transportstyrelsen.se/sv/vagtrafik/Fordon/Skatter-och-avgifter/bonus-malus/',
    urls: [
      'https://www.transportstyrelsen.se/sv/vagtrafik/Fordon/Skatter-och-avgifter/bonus-malus/',
      'https://www.naturvardsverket.se/bidrag/elbilspremien/',
    ],
    match: ['bonus', 'malus', 'premie', 'elbil', 'bidrag', 'stöd'],
    emptyHint: 'Bonus/malus och premie bevakas över myndighetssidor där regler kan flytta.',
  },
];

const normalize = (s) => s.replace(/\s+/g, ' ').trim();
const stripHtml = (html) => normalize(html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&'));

function pickRelevantLines(text, terms, { requireNumbers = true, max = 8 } = {}) {
  const lines = text.split(/(?<=[.!?])\s+/);
  const out = [];
  for (const line of lines) {
    const l = line.toLowerCase();
    if (!terms.some((t) => l.includes(t.toLowerCase()))) continue;
    if (requireNumbers && !/(\d+[\d\s.,]*\s?(kr|sek|:-)|\d+[,.]?\d*\s?%)/i.test(line)) continue;
    const clean = normalize(line);
    if (clean.length >= 20 && clean.length <= 240) out.push(clean);
    if (out.length >= max) break;
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

async function fetchSourceUrl(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'ev-price-watcher-se/0.1',
      'accept-language': 'sv-SE,sv;q=0.9,en;q=0.8',
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function uniqueLines(lines, max = 12) {
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

async function fetchSource(source) {
  const targetUrls = source.urls?.length ? source.urls : [source.url];
  const chunks = [];
  const failures = [];

  for (const url of targetUrls) {
    try {
      const html = await fetchSourceUrl(url);
      const text = stripHtml(html);
      const priceLines = pickRelevantLines(text, source.match, { requireNumbers: true, max: 8 });
      const watchLines = priceLines.length
        ? priceLines
        : pickRelevantLines(text, source.match, { requireNumbers: false, max: 8 });

      // Fallback fingerprint when keyword extraction returns nothing (common on JS-heavy pages).
      const fallbackFingerprint = watchLines.length ? '' : normalize(text).slice(0, 4000);
      const canonical = `${watchLines.join('\n')}\n${fallbackFingerprint}`;

      chunks.push({
        url,
        watchLines,
        priceLines,
        hasPriceSignals: priceLines.length > 0,
        canonical,
      });
    } catch (err) {
      failures.push(`${url}: ${err instanceof Error ? err.message : 'okänt fel'}`);
    }
  }

  if (!chunks.length) {
    throw new Error(failures.slice(0, 2).join(' | '));
  }

  const lines = uniqueLines(chunks.flatMap((c) => c.watchLines));
  const priceLines = uniqueLines(chunks.flatMap((c) => c.priceLines));
  const canonical = chunks.map((c) => `${c.url}\n${c.canonical}`).join('\n---\n');

  return {
    updatedAt: new Date().toISOString(),
    lines,
    priceLines,
    hasPriceSignals: priceLines.length > 0,
    hash: createHash('sha256').update(canonical).digest('hex'),
    monitoredUrls: targetUrls,
    failedUrls: failures,
  };
}

function summarizeChange(oldData, nowData) {
  if (!oldData) return 'Första mätningen för källan.';
  if (oldData.hash === nowData.hash) return 'Ingen ändring sedan förra körningen.';
  if (nowData.hasPriceSignals) return 'Pris/ränta eller erbjudandetext har ändrats.';
  return 'Innehållssignal ändrad (kan vara kampanj- eller regeltext).';
}

export async function runWatch() {
  const prev = await loadState();
  const next = { sources: { ...(prev.sources || {}) } };
  const details = [];
  let changedCount = 0;
  let errorCount = 0;

  for (const source of SOURCES) {
    const old = prev.sources?.[source.key];

    try {
      const now = await fetchSource(source);
      const changed = !old || old.hash !== now.hash;
      const lastChangedAt = changed ? now.updatedAt : (old?.lastChangedAt || null);

      next.sources[source.key] = {
        ...now,
        lastChangedAt,
      };

      if (changed) changedCount += 1;

      details.push({
        key: source.key,
        name: source.name,
        url: source.url,
        status: 'ok',
        changed,
        updatedAt: now.updatedAt,
        lines: now.lines,
        priceLines: now.priceLines,
        monitoredUrls: now.monitoredUrls,
        failedUrls: now.failedUrls,
        hasPriceSignals: now.hasPriceSignals,
        hasData: now.lines.length > 0,
        lastChangedAt,
        changeSummary: summarizeChange(old, now),
        emptyHint: source.emptyHint || null,
        tco: tcoImpact(old?.lines, now.lines),
      });
    } catch (err) {
      errorCount += 1;
      details.push({
        key: source.key,
        name: source.name,
        url: source.url,
        status: 'error',
        changed: false,
        updatedAt: old?.updatedAt || null,
        lines: old?.lines || [],
        priceLines: old?.priceLines || [],
        monitoredUrls: old?.monitoredUrls || (source.urls?.length ? source.urls : [source.url]),
        failedUrls: old?.failedUrls || [],
        hasPriceSignals: (old?.priceLines || []).length > 0,
        hasData: (old?.lines || []).length > 0,
        lastChangedAt: old?.lastChangedAt || null,
        changeSummary: 'Kunde inte verifiera ändring i denna körning.',
        emptyHint: source.emptyHint || null,
        tco: old ? tcoImpact(old.lines, old.lines) : 'TCO: ej kvantifierbar (saknar data).',
        error: err instanceof Error ? err.message : 'okänt fel',
      });
    }
  }

  await saveState(next);

  return {
    generatedAt: new Date().toISOString(),
    stateFile: STATE_FILE,
    totalSources: SOURCES.length,
    changedCount,
    errorCount,
    sources: details,
  };
}

function formatConsoleSummary(result) {
  const rows = [
    `Kort bevakningssammanfattning (${new Date().toLocaleString('sv-SE')})`,
    `Källor: ${result.totalSources}, ändrade: ${result.changedCount}, fel: ${result.errorCount}`,
  ];

  for (const source of result.sources) {
    if (source.status === 'error') {
      rows.push([
        `• ${source.name}: kunde inte uppdatera (${source.error})`,
        `  Länk: ${source.url}`,
      ].join('\n'));
      continue;
    }

    rows.push([
      `• ${source.name}: ${source.changed ? 'ändring upptäckt' : 'ingen ändring'}`,
      `  Länk: ${source.url}`,
      `  Nytt: ${source.lines.slice(0, 3).join(' | ') || 'Inga pris/ränta-rader hittades.'}`,
      `  ${source.tco}`,
    ].join('\n'));
  }

  return rows.join('\n\n');
}

const entryPoint = process.argv[1] ? resolve(process.argv[1]) : '';

if (entryPoint === fileURLToPath(import.meta.url)) {
  runWatch()
    .then((result) => {
      console.log(formatConsoleSummary(result));
    })
    .catch((err) => {
      console.error('Watcher misslyckades:', err);
      process.exitCode = 1;
    });
}