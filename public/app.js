const statusUrl = '/api/status';
const runUrl = '/api/run';

const metricsRoot = document.getElementById('metrics');
const largestChangeRoot = document.getElementById('largest-change');
const latestSignalsRoot = document.getElementById('latest-signals');
const popularBrandsRoot = document.getElementById('popular-brands');
const signalsTable = document.getElementById('signals-table');
const signalsEmpty = document.getElementById('signals-empty');
const sourceGrid = document.getElementById('source-grid');
const secondaryList = document.getElementById('secondary-list');
const template = document.getElementById('source-template');

const refreshButton = document.getElementById('refresh-button');
const lastUpdated = document.getElementById('last-updated');
const nextRefresh = document.getElementById('next-refresh');

const searchInput = document.getElementById('search-input');
const brandFilter = document.getElementById('brand-filter');
const typeFilter = document.getElementById('type-filter');
const dateFilter = document.getElementById('date-filter');
const changeFilter = document.getElementById('change-filter');
const sortFilter = document.getElementById('sort-filter');

let statusCache = null;

function fmt(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('sv-SE');
}

function fmtNum(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return value.toLocaleString('sv-SE', { maximumFractionDigits: 2 });
}

function renderSkeletons() {
  metricsRoot.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  largestChangeRoot.innerHTML = '<div class="skeleton"></div>';
  latestSignalsRoot.innerHTML = '<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>';
  signalsTable.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
}

function buildKpi(label, value, sub) {
  return `
    <article class="kpi-card">
      <p class="kpi-label">${label}</p>
      <p class="kpi-value">${value}</p>
      <p class="panel-meta">${sub || ''}</p>
    </article>
  `;
}

function renderMetrics(data) {
  const active = data.activeSignals || 0;
  metricsRoot.innerHTML = [
    buildKpi('Bevakade källor', data.totalSources, 'Automatisk bevakning'),
    buildKpi('Aktiva signaler', active, 'Pris/ränta/leasing/bonus'),
    buildKpi('Senaste uppdatering', fmt(data.generatedAt), ''),
    buildKpi('Nästa körning', fmt(data.nextRefreshAt), `Var ${data.refreshMinutes} minut`),
  ].join('');
}

function renderLargestChange(change) {
  if (!change) {
    largestChangeRoot.innerHTML = '<div class="empty-state">Inga större mätbara förändringar ännu idag. Bevakningen är aktiv.</div>';
    return;
  }

  const diff = change.deltaAbs === null
    ? 'Innehållsändring upptäckt'
    : `${change.deltaAbs > 0 ? '+' : ''}${fmtNum(change.deltaAbs)} ${change.unit || ''}`;

  largestChangeRoot.innerHTML = `
    <div class="signal-row">
      <div class="signal-main">
        <p class="signal-brand">${change.brand}</p>
        <p class="signal-model">${change.model} • ${change.type}</p>
      </div>
      <div class="signal-meta">
        <p>${change.changedText}</p>
        <p class="panel-meta">${fmt(change.timestamp)}</p>
      </div>
      <div class="signal-diff">
        <p class="dir-badge ${change.direction === 'up' ? 'dir-up' : change.direction === 'down' ? 'dir-down' : 'dir-changed'}">${diff}</p>
      </div>
      <div class="signal-source">
        <p><a class="source-link" href="${change.sourceUrl}" target="_blank" rel="noreferrer">Källa</a></p>
      </div>
      <div></div>
    </div>
  `;
}

function renderLatestSignals(signals) {
  if (!signals?.length) {
    latestSignalsRoot.innerHTML = '<li class="empty-state">Inga nya signaler ännu. Vi visar nästa förändring direkt när den upptäcks.</li>';
    return;
  }

  latestSignalsRoot.innerHTML = signals.map((signal) => `
    <li class="compact-item">
      <p><strong>${signal.brand}</strong> • ${signal.model}</p>
      <p>${signal.type}: ${signal.changedText}</p>
      <p class="panel-meta">${fmt(signal.timestamp)}</p>
    </li>
  `).join('');
}

function renderPopularBrands(brands) {
  if (!brands?.length) {
    popularBrandsRoot.innerHTML = '<div class="empty-state">Data byggs upp när fler signaler samlas in.</div>';
    return;
  }
  popularBrandsRoot.innerHTML = brands.map((item) => `<span class="brand-pill">${item.brand} • ${item.count}</span>`).join('');
}

function signalMatchDate(signal, mode) {
  if (mode === 'all') return true;
  const ts = new Date(signal.timestamp).getTime();
  const now = Date.now();
  if (mode === '24h') return now - ts <= 24 * 60 * 60 * 1000;
  if (mode === '7d') return now - ts <= 7 * 24 * 60 * 60 * 1000;
  if (mode === '30d') return now - ts <= 30 * 24 * 60 * 60 * 1000;
  return true;
}

function filterSignals(signals) {
  const q = searchInput.value.trim().toLowerCase();
  const brand = brandFilter.value;
  const type = typeFilter.value;
  const date = dateFilter.value;
  const change = changeFilter.value;

  return signals.filter((signal) => {
    if (brand !== 'all' && signal.brand !== brand) return false;
    if (type !== 'all' && signal.type !== type) return false;
    if (!signalMatchDate(signal, date)) return false;
    if (change === 'down' && signal.direction !== 'down') return false;
    if (change === 'up' && signal.direction !== 'up') return false;
    if (change === 'rate' && signal.type !== 'Ränta') return false;

    if (!q) return true;
    return [signal.brand, signal.model, signal.changedText, signal.type]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}

function sortSignals(signals) {
  const mode = sortFilter.value;
  if (mode === 'largest') {
    return [...signals].sort((a, b) => Math.abs(b.deltaAbs || 0) - Math.abs(a.deltaAbs || 0));
  }
  if (mode === 'relevant') {
    const score = (s) => (s.type === 'Ränta' ? 3 : s.type === 'Pris' ? 2 : 1) + (s.direction === 'down' ? 2 : 0);
    return [...signals].sort((a, b) => score(b) - score(a));
  }
  return [...signals].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function renderSignalFeed(signals) {
  if (!signals.length) {
    signalsTable.innerHTML = '';
    signalsEmpty.classList.remove('hidden');
    return;
  }

  signalsEmpty.classList.add('hidden');
  signalsTable.innerHTML = signals.map((signal) => {
    const oldVal = signal.oldValue === null ? '-' : `${fmtNum(signal.oldValue)} ${signal.unit || ''}`;
    const newVal = signal.newValue === null ? '-' : `${fmtNum(signal.newValue)} ${signal.unit || ''}`;
    const diff = signal.deltaAbs === null
      ? 'Signal uppdaterad'
      : `${signal.deltaAbs > 0 ? '+' : ''}${fmtNum(signal.deltaAbs)} ${signal.unit || ''}`;
    const pct = signal.deltaPct === null ? '' : `(${signal.deltaPct > 0 ? '+' : ''}${fmtNum(signal.deltaPct)}%)`;

    return `
      <article class="signal-row">
        <div class="signal-main">
          <p class="signal-brand">${signal.brand}</p>
          <p class="signal-model">${signal.model}</p>
          <span class="type-badge">${signal.type}</span>
        </div>
        <div class="signal-meta">
          <p>${signal.changedText}</p>
          <p class="panel-meta">${fmt(signal.timestamp)}</p>
        </div>
        <div class="signal-diff">
          <p class="panel-meta">Tidigare → Nu</p>
          <p>${oldVal} → ${newVal}</p>
        </div>
        <div class="signal-diff">
          <p class="dir-badge ${signal.direction === 'up' ? 'dir-up' : signal.direction === 'down' ? 'dir-down' : 'dir-changed'}">${diff} ${pct}</p>
        </div>
        <div class="signal-source">
          <p><a class="source-link" href="${signal.sourceUrl}" target="_blank" rel="noreferrer">Källa</a></p>
        </div>
      </article>
    `;
  }).join('');
}

function buildSourceBadge(source) {
  if (source.status === 'error') return { text: 'Källa otillgänglig', cls: 'badge error' };
  if (source.changed) return { text: 'Ny signal upptäckt', cls: 'badge changed' };
  return { text: 'Stabil', cls: 'badge ok' };
}

function renderSources(data) {
  sourceGrid.innerHTML = '';
  secondaryList.innerHTML = '';

  const primarySources = data.sources.filter((source) => source.status === 'ok' && source.lines.length > 0);
  const fallbackSources = data.sources.filter((source) => !(source.status === 'ok' && source.lines.length > 0));

  for (const source of primarySources) {
    const node = template.content.firstElementChild.cloneNode(true);
    const badge = buildSourceBadge(source);

    node.querySelector('h3').textContent = source.name;
    node.querySelector('.badge').className = badge.cls;
    node.querySelector('.badge').textContent = badge.text;
    node.querySelector('.source-link').href = source.url;
    node.querySelector('.stamp').textContent = `Senast läst: ${fmt(source.updatedAt)}`;
    node.querySelector('.change-info').textContent = `Senast ändring: ${fmt(source.lastChangedAt)} • ${source.changeSummary}`;

    const lines = node.querySelector('.line-list');
    for (const text of source.lines.slice(0, 4)) {
      const li = document.createElement('li');
      li.textContent = text;
      lines.append(li);
    }
    sourceGrid.append(node);
  }

  if (!primarySources.length) {
    sourceGrid.innerHTML = '<div class="empty-state">Inga nya prisförändringar just nu. Bevakningen är aktiv.</div>';
  }

  for (const source of fallbackSources) {
    const reason = source.status === 'error'
      ? `Kunde inte hämta källa: ${source.error}`
      : source.emptyHint || 'Källa bevakas via innehållssignaler.';
    secondaryList.innerHTML += `
      <article class="source-card">
        <div class="card-head">
          <h3>${source.name}</h3>
          <span class="badge ok">Bevakas</span>
        </div>
        <a class="source-link" href="${source.url}" target="_blank" rel="noreferrer">Öppna källa</a>
        <p class="stamp">Senast läst: ${fmt(source.updatedAt)}</p>
        <p class="change-info">${reason}</p>
      </article>
    `;
  }
}

function hydrateFilters(signals) {
  const brands = [...new Set(signals.map((signal) => signal.brand))].sort((a, b) => a.localeCompare(b, 'sv-SE'));
  brandFilter.innerHTML = '<option value="all">Alla märken</option>' + brands.map((brand) => `<option value="${brand}">${brand}</option>`).join('');
}

function renderAll() {
  if (!statusCache) return;

  renderMetrics(statusCache);
  renderLargestChange(statusCache.largestChange);
  renderLatestSignals(statusCache.latestSignals || []);
  renderPopularBrands(statusCache.popularBrands || []);
  renderSources(statusCache);

  const filtered = sortSignals(filterSignals(statusCache.signalFeed || []));
  renderSignalFeed(filtered);
}

async function loadStatus() {
  const response = await fetch(statusUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Statusfel ${response.status}`);
  statusCache = await response.json();

  lastUpdated.textContent = fmt(statusCache.generatedAt);
  nextRefresh.textContent = fmt(statusCache.nextRefreshAt);
  hydrateFilters(statusCache.signalFeed || []);
  renderAll();
}

async function runNow() {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Uppdaterar...';
  try {
    const response = await fetch(runUrl, { method: 'POST' });
    if (!response.ok) throw new Error(`Körning misslyckades (${response.status})`);
    await loadStatus();
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Okänt fel');
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Uppdatera nu';
  }
}

for (const element of [searchInput, brandFilter, typeFilter, dateFilter, changeFilter, sortFilter]) {
  element.addEventListener('input', renderAll);
  element.addEventListener('change', renderAll);
}
refreshButton.addEventListener('click', runNow);

renderSkeletons();
loadStatus().catch((error) => {
  console.error(error);
  signalsTable.innerHTML = '';
  signalsEmpty.classList.remove('hidden');
  signalsEmpty.textContent = 'Kunde inte ladda data just nu. Testa att uppdatera sidan.';
});

setInterval(() => {
  loadStatus().catch((error) => {
    console.error('Kunde inte uppdatera vy:', error);
  });
}, 30_000);
