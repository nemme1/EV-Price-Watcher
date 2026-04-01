import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = process.env.STATE_PATH?.trim() || resolve(ROOT_DIR, 'state.json');
const MONTHS = 36;

export const SOURCES = [
  {
    key: 'tesla',
    name: 'Tesla Sverige',
    brand: 'Tesla',
    retailers: ['Tesla'],
    url: 'https://www.tesla.com/sv_se',
    type: 'auto',
    match: ['lagerbil', 'ränta', 'leasing', 'kr', '%'],
    signalTerms: ['ränta', 'leasing', 'kampanj', 'lager', 'pris', 'mån'],
    includeTerms: ['privat', 'privatleasing', 'privatavbetalning', 'ränta', 'leasing', 'mån'],
    excludeTerms: ['företag', 'företagsleasing', 'business', 'fleet', 'operationell leasing', 'tjänstebil'],
    modelTerms: ['Model 3', 'Model Y', 'Model S', 'Model X'],
  },
  {
    key: 'xpeng',
    name: 'Xpeng Sverige',
    brand: 'XPENG',
    retailers: ['Bilia', 'XPENG Sverige'],
    url: 'https://www.xpeng.com/se',
    urls: [
      'https://www.xpeng.com/se',
      'https://www.xpeng.com/se/finance',
      'https://www.xpeng.com/se/quick-delivery',
      'https://www.xpeng.com/se/campaign/p7plus-kampanj',
    ],
    type: 'auto',
    match: ['kampanj', 'ränta', 'leasing', 'kr', '%'],
    signalTerms: ['ränta', 'leasing', 'kampanj', 'lager', 'pris', 'mån'],
    includeTerms: ['privat', 'privatleasing', 'ränta', 'leasing', 'mån', 'kampanj'],
    excludeTerms: ['företag', 'företagsleasing', 'business', 'fleet', 'operationell leasing', 'tjänstebil'],
    modelTerms: ['G6', 'G9', 'P7+', 'P7'],
    emptyHint: 'Vissa undersidor är JS-renderade, men bevakning körs nu på flera kampanj-/finance-sidor.',
  },
  {
    key: 'byd',
    name: 'BYD Sverige',
    brand: 'BYD',
    retailers: ['Hedin Automotive', 'BYD Sverige'],
    url: 'https://www.byd.com/se',
    urls: [
      'https://www.byd.com/se',
      'https://www.byd.com/se/kampanj',
      'https://www.byd.com/se/electric-cars/atto-3-evo.html',
    ],
    type: 'auto',
    match: ['erbjudande', 'ränta', 'leasing', 'kr', '%'],
    signalTerms: ['ränta', 'leasing', 'kampanj', 'erbjud', 'pris', 'mån'],
    includeTerms: ['privat', 'privatleasing', 'ränta', 'leasing', 'mån', 'kampanj', 'erbjud'],
    excludeTerms: ['företag', 'företagsleasing', 'business', 'fleet', 'operationell leasing', 'tjänstebil'],
    modelTerms: ['ATTO 2', 'ATTO 3', 'SEAL U', 'SEALION 7', 'SEAL', 'DOLPHIN', 'HAN', 'TANG'],
    emptyHint: 'BYD-sidor bevakas via flera svenska undersidor för kampanj och modellpris.',
  },
  {
    key: 'kia',
    name: 'Kia Sverige',
    brand: 'Kia',
    retailers: ['Kia Sweden', 'Auktoriserade Kia-återförsäljare'],
    url: 'https://www.kia.com/se/kopa/erbjudanden/',
    urls: ['https://www.kia.com/se/kopa/erbjudanden/', 'https://www.kia.com/se'],
    type: 'auto',
    match: ['erbjudande', 'kampanj', 'ränta', 'kr', '%'],
    signalTerms: ['ränta', 'leasing', 'kampanj', 'erbjud', 'pris', 'mån'],
    includeTerms: ['privat', 'privatleasing', 'ränta', 'leasing', 'mån', 'kampanj', 'erbjud'],
    excludeTerms: ['företag', 'företagsleasing', 'business', 'fleet', 'operationell leasing', 'tjänstebil'],
    modelTerms: ['Picanto', 'Stonic', 'EV2', 'EV3', 'EV4', 'EV5', 'EV6', 'EV9', 'Niro', 'Sportage', 'Sorento', 'K4'],
  },
  {
    key: 'regeringen',
    name: 'Regeringen (elbilspremie)',
    brand: 'Myndighet',
    retailers: ['Regeringen'],
    url: 'https://www.regeringen.se/',
    urls: ['https://www.regeringen.se/', 'https://www.regeringen.se/pressmeddelanden/'],
    type: 'policy',
    match: ['elbilspremie', 'elbil', 'stöd', 'bonus', 'premie', 'bidrag'],
    signalTerms: ['elbilspremie', 'bonus', 'malus', 'premie', 'bidrag', 'stöd', 'elbil'],
    emptyHint: 'Regeringen bevakas på startsida och pressmeddelanden för policyändringar.',
  },
  {
    key: 'transportstyrelsen',
    name: 'Transportstyrelsen (elbilspremie)',
    brand: 'Myndighet',
    retailers: ['Transportstyrelsen', 'Naturvårdsverket'],
    url: 'https://www.transportstyrelsen.se/sv/vagtrafik/Fordon/Skatter-och-avgifter/bonus-malus/',
    urls: [
      'https://www.transportstyrelsen.se/sv/vagtrafik/Fordon/Skatter-och-avgifter/bonus-malus/',
      'https://www.naturvardsverket.se/bidrag/elbilspremien/',
    ],
    type: 'policy',
    match: ['bonus', 'malus', 'premie', 'elbil', 'bidrag', 'stöd'],
    signalTerms: ['bonus', 'malus', 'premie', 'elbil', 'bidrag', 'stöd'],
    emptyHint: 'Bonus/malus och premie bevakas över myndighetssidor där regler kan flytta.',
  },
];

const normalize = (s) => s.replace(/\s+/g, ' ').trim();
const stripHtml = (html) => normalize(html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&aring;|&#229;|&#x00E5;/gi, 'å')
  .replace(/&auml;|&#228;|&#x00E4;/gi, 'ä')
  .replace(/&ouml;|&#246;|&#x00F6;/gi, 'ö')
  .replace(/&Aring;|&#197;|&#x00C5;/gi, 'Å')
  .replace(/&Auml;|&#196;|&#x00C4;/gi, 'Ä')
  .replace(/&Ouml;|&#214;|&#x00D6;/gi, 'Ö')
  .replace(/&ndash;|&#8211;/gi, '-')
  .replace(/&quot;|&#34;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'"));

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
      const watchLines = source.type === 'auto'
        ? extractAutoEntries(text, source)
        : filterSignalLines(
            pickRelevantLines(text, source.match, { requireNumbers: false, max: 8 }),
            source.signalTerms
          );
      const priceLines = source.type === 'auto'
        ? watchLines
        : pickRelevantLines(text, source.match, { requireNumbers: true, max: 8 });

      // For policy pages we keep a broad fallback fingerprint; for auto pages this causes noisy false positives.
      const fallbackFingerprint = watchLines.length
        ? ''
        : (source.type === 'policy' ? normalize(text).slice(0, 4000) : '');
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
  if (!oldData) return 'Baslinje skapad.';
  if (oldData.hash === nowData.hash) return 'Ingen ändring sedan förra körningen.';
  if (nowData.hasPriceSignals) return 'Pris/ränta eller erbjudandetext har ändrats.';
  return 'Innehållssignal ändrad (kan vara kampanj- eller regeltext).';
}

function classifySignalType(text) {
  const line = text.toLowerCase();
  if (line.includes('ränta') || line.includes('%')) return 'Ränta';
  if (line.includes('leasing') || line.includes('mån')) return 'Leasing';
  if (line.includes('bonus') || line.includes('premie') || line.includes('malus') || line.includes('bidrag')) return 'Bonus';
  if (line.includes('kampanj') || line.includes('erbjud')) return 'Kampanj';
  return 'Pris';
}

function extractNumericValue(text) {
  const match = text.match(/(\d[\d\s.]*(?:,\d+)?)(?=\s?(kr|sek|:-|%|mån))/i);
  if (!match) return null;
  const value = Number(match[1].replace(/\s|\./g, '').replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const unitMatch = text.match(/\b(kr|sek|:-|%|kr\/mån|mån)\b/i);
  return {
    value,
    unit: unitMatch ? unitMatch[1].toLowerCase() : null,
  };
}

function parseLineEntry(line) {
  const splitIndex = line.indexOf(':');
  if (splitIndex < 0) {
    return {
      model: 'Okänd modell',
      detail: line,
      type: classifySignalType(line),
      numeric: extractNumericValue(line),
    };
  }

  const model = line.slice(0, splitIndex).trim() || 'Okänd modell';
  const detail = line.slice(splitIndex + 1).trim() || line;
  return {
    model,
    detail,
    type: classifySignalType(detail),
    numeric: extractNumericValue(detail),
  };
}

function buildSourceSignals(source, oldLines = [], newLines = [], timestamp) {
  const oldEntries = oldLines.map(parseLineEntry);
  const newEntries = newLines.map(parseLineEntry);

  const oldMap = new Map(oldEntries.map((entry) => [`${entry.model}|${entry.type}`, entry]));
  const newMap = new Map(newEntries.map((entry) => [`${entry.model}|${entry.type}`, entry]));
  const keys = new Set([...oldMap.keys(), ...newMap.keys()]);

  const signals = [];
  for (const key of keys) {
    const prev = oldMap.get(key);
    const curr = newMap.get(key);
    if (!curr) continue;
    if (prev && prev.detail === curr.detail) continue;

    const oldValue = prev?.numeric?.value ?? null;
    const newValue = curr.numeric?.value ?? null;
    const deltaAbs = oldValue !== null && newValue !== null ? newValue - oldValue : null;
    const deltaPct = oldValue && newValue !== null ? ((newValue - oldValue) / oldValue) * 100 : null;
    const direction = deltaAbs === null ? 'changed' : (deltaAbs < 0 ? 'down' : deltaAbs > 0 ? 'up' : 'flat');

    signals.push({
      id: `${source.key}-${key}-${timestamp}`,
      brand: source.name,
      model: curr.model,
      type: curr.type,
      changedText: curr.detail,
      oldText: prev?.detail || null,
      newText: curr.detail,
      oldValue,
      newValue,
      unit: curr.numeric?.unit || prev?.numeric?.unit || null,
      deltaAbs,
      deltaPct,
      direction,
      timestamp,
      sourceUrl: source.url,
    });
  }

  return signals;
}

export async function runWatch() {
  const prev = await loadState();
  const next = { sources: { ...(prev.sources || {}) } };
  const runSignals = [];
  const campaignPool = [];
  const details = [];
  let changedCount = 0;
  let errorCount = 0;

  for (const source of SOURCES) {
    const old = prev.sources?.[source.key];

    try {
      const now = await fetchSource(source);
      const isBaseline = !old;
      const changed = old ? old.hash !== now.hash : false;
      const lastChangedAt = changed
        ? now.updatedAt
        : (old?.lastChangedAt || (isBaseline ? now.updatedAt : null));

      next.sources[source.key] = {
        ...now,
        lastChangedAt,
      };

      if (changed) changedCount += 1;

      if (changed) {
        runSignals.push(...buildSourceSignals(source, old?.lines || [], now.lines || [], now.updatedAt));
      }

      campaignPool.push(...buildSourceCampaigns(source, now.lines || [], now.updatedAt));

      details.push({
        key: source.key,
        name: source.name,
        url: source.url,
        status: 'ok',
        isBaseline,
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
        tco: '',
      });
    } catch (err) {
      errorCount += 1;
      details.push({
        key: source.key,
        name: source.name,
        url: source.url,
        status: 'error',
        isBaseline: false,
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
        tco: '',
        error: err instanceof Error ? err.message : 'okänt fel',
      });
    }
  }

  const previousHistory = Array.isArray(prev.signalHistory) ? prev.signalHistory : [];
  const signalHistory = [...runSignals, ...previousHistory].slice(0, 200);
  next.signalHistory = signalHistory;

  await saveState(next);

  const latestSignals = signalHistory.slice(0, 5);
  const signalFeed = signalHistory.slice(0, 80);
  const largestChange = signalHistory
    .filter((signal) => typeof signal.deltaAbs === 'number')
    .sort((a, b) => Math.abs(b.deltaAbs) - Math.abs(a.deltaAbs))[0] || null;

  const brandCounter = new Map();
  for (const signal of signalHistory.slice(0, 50)) {
    brandCounter.set(signal.brand, (brandCounter.get(signal.brand) || 0) + 1);
  }
  const popularBrands = [...brandCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([brand, count]) => ({ brand, count }));

  const campaigns = campaignPool
    .sort((a, b) => new Date(b.verified_at) - new Date(a.verified_at))
    .slice(0, 240);

  const bestRateOffers = campaigns
    .filter((offer) => offer.interest_rate !== null && (offer.customer_type === 'private_purchase' || offer.customer_type === 'private_leasing'))
    .sort((a, b) => a.interest_rate - b.interest_rate);

  const bestRate = bestRateOffers[0] || null;
  const recentCampaigns = campaigns.slice(0, 8);
  const expiringSoon = campaigns
    .filter((offer) => offer.valid_to)
    .sort((a, b) => new Date(a.valid_to) - new Date(b.valid_to))
    .slice(0, 8);

  const monitoredBrands = [...new Set(campaigns.map((offer) => offer.brand))].length;
  const activePrivateCampaigns = campaigns.filter((offer) => offer.is_private_customer_offer).length;

  return {
    generatedAt: new Date().toISOString(),
    stateFile: STATE_FILE,
    totalSources: SOURCES.length,
    changedCount,
    errorCount,
    activeSignals: details.filter((s) => s.status === 'ok' && s.lines.length > 0).length,
    monitoredBrands,
    activePrivateCampaigns,
    bestRate,
    recentCampaigns,
    expiringSoon,
    campaigns,
    latestSignals,
    signalFeed,
    largestChange,
    popularBrands,
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
      ...(source.tco ? [`  ${source.tco}`] : []),
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

function filterSignalLines(lines, signalTerms = []) {
  if (!signalTerms.length) return lines;
  return lines.filter((line) => {
    const l = line.toLowerCase();
    return signalTerms.some((term) => l.includes(term.toLowerCase()));
  });
}

function includesAny(text, terms = []) {
  if (!terms.length) return true;
  const value = text.toLowerCase();
  return terms.some((term) => value.includes(term.toLowerCase()));
}

function hasPriceOrRateSignal(text) {
  return /(\d+[\d\s.,]*\s?(kr|sek|:-)|\d+[,.]?\d*\s?%|\d+[\d\s.,]*\s?mån)/i.test(text);
}

function detectModelAround(lines, index, modelTerms = []) {
  const nearby = [lines[index - 2], lines[index - 1], lines[index], lines[index + 1], lines[index + 2]].filter(Boolean).join(' ');
  for (const model of modelTerms) {
    if (nearby.toLowerCase().includes(model.toLowerCase())) return model;
  }
  return null;
}

function extractAutoEntries(text, source) {
  const lines = text.split(/(?<=[.!?])\s+/).map(normalize).filter((line) => line.length >= 20 && line.length <= 260);
  const out = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!includesAny(line, source.match)) continue;
    if (!includesAny(line, source.includeTerms)) continue;
    if (source.excludeTerms?.length && includesAny(line, source.excludeTerms)) continue;
    if (!hasPriceOrRateSignal(line)) continue;

    const model = detectModelAround(lines, i, source.modelTerms || []);
    if (!model) continue;

    out.push(`${model}: ${line}`);
    if (out.length >= 10) break;
  }

  return uniqueLines(out, 10);
}

function parseSwedishDate(text) {
  const months = {
    januari: 0, februari: 1, mars: 2, april: 3, maj: 4, juni: 5,
    juli: 6, augusti: 7, september: 8, oktober: 9, november: 10, december: 11,
  };
  const m = text.toLowerCase().match(/(\d{1,2})\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+(\d{4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = months[m[2]];
  const year = Number(m[3]);
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseInterestRate(text) {
  const match = text.match(/(\d+[,.]?\d*)\s?%\s*(?:ränta)?/i);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function parseMoney(text, markerRegex) {
  const m = text.match(markerRegex);
  if (!m) return null;
  const parsed = Number(m[1].replace(/\s|\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyCustomerType(text) {
  const value = text.toLowerCase();
  if (/företag|business|fleet|tjänstebil|operationell leasing/.test(value)) return 'business';
  if (/privatleasing|privatavbetalning|privat|privatköp/.test(value)) return 'private';
  return 'unknown';
}

function classifyOfferType(text) {
  const value = text.toLowerCase();
  if (value.includes('ränta')) return 'Ränteerbjudande';
  if (value.includes('privatleasing') || value.includes('leasing')) return 'Privatleasing';
  if (value.includes('bonus') || value.includes('premie') || value.includes('malus')) return 'Bonus';
  if (value.includes('lager')) return 'Lagerbil';
  return 'Tillfälligt erbjudande';
}

function confidenceScore(campaign) {
  let score = 0.45;
  if (campaign.interest_rate !== null) score += 0.2;
  if (campaign.monthly_price !== null) score += 0.1;
  if (campaign.model && campaign.model !== 'Okänd modell') score += 0.1;
  if (campaign.valid_to) score += 0.1;
  if (campaign.is_private_customer_offer) score += 0.1;
  return Math.min(0.99, Number(score.toFixed(2)));
}

function buildCampaignRecord(source, entry, verifiedAt) {
  const text = entry.detail;
  const customerType = classifyCustomerType(text);
  const interestRate = parseInterestRate(text);
  const monthlyPrice = parseMoney(text, /från\s+([\d\s.,]+)\s?kr\/?mån/i) || parseMoney(text, /([\d\s.,]+)\s?kr\/?mån/i);
  const cashDepositPercent = parseMoney(text, /([\d\s.,]+)\s?%\s*kontantinsats/i);
  const durationMonths = parseMoney(text, /(\d{1,3})\s*mån/i);
  const mileagePerYear = parseMoney(text, /(\d[\d\s]*)\s*mil\s*per\s*år/i);
  const finalPayment = parseMoney(text, /rest(?:värde|skuld)\s*[:]?\s*([\d\s.,]+)\s?kr/i);
  const validTo = parseSwedishDate(text);

  const isPrivate = customerType === 'private' || source.type === 'policy';
  const isBusiness = customerType === 'business';
  const offerType = classifyOfferType(text);

  let customerTypeNormalized = 'unknown';
  if (source.type === 'policy') customerTypeNormalized = 'policy';
  else if (isBusiness) customerTypeNormalized = 'business';
  else if (offerType === 'Privatleasing') customerTypeNormalized = 'private_leasing';
  else customerTypeNormalized = 'private_purchase';

  const campaign = {
    brand: source.brand,
    model: entry.model,
    retailer: source.retailers?.[0] || source.name,
    retailer_partners: source.retailers || [source.name],
    offer_type: offerType,
    customer_type: customerTypeNormalized,
    interest_rate: interestRate,
    monthly_price: monthlyPrice,
    cash_deposit: cashDepositPercent,
    duration_months: durationMonths,
    mileage_per_year: mileagePerYear,
    final_payment: finalPayment,
    campaign_title: `${source.brand} ${entry.model} ${offerType}`.trim(),
    campaign_summary: text,
    valid_from: null,
    valid_to: validTo,
    campaign_url: source.url,
    source_name: source.name,
    verified_at: verifiedAt,
    is_private_customer_offer: source.type === 'policy' ? false : !isBusiness,
    is_business_offer: isBusiness,
    confidence_score: 0,
    extracted_terms_raw: text,
  };
  campaign.confidence_score = confidenceScore(campaign);
  return campaign;
}

function buildSourceCampaigns(source, lines, verifiedAt) {
  const campaigns = lines
    .map(parseLineEntry)
    .map((entry) => buildCampaignRecord(source, entry, verifiedAt));

  return campaigns.filter((campaign) => {
    if (source.type === 'policy') return true;
    if (campaign.is_business_offer && !campaign.is_private_customer_offer) return false;
    if (!campaign.is_private_customer_offer) return false;
    if (campaign.confidence_score < 0.55) return false;
    return true;
  });
}