const statusUrl = '/api/status';
const runUrl = '/api/run';

const metricsRoot = document.getElementById('metrics');
const grid = document.getElementById('source-grid');
const secondaryList = document.getElementById('secondary-list');
const template = document.getElementById('source-template');
const lastUpdated = document.getElementById('last-updated');
const nextRefresh = document.getElementById('next-refresh');
const refreshButton = document.getElementById('refresh-button');

function fmt(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('sv-SE');
}

function buildMetric(label, value) {
  const wrap = document.createElement('article');
  wrap.className = 'metric';
  wrap.innerHTML = `<p class="metric-key">${label}</p><p class="metric-value">${value}</p>`;
  return wrap;
}

function renderMetrics(data) {
  const primaryCount = data.sources.filter((source) => source.status === 'ok' && source.lines.length > 0).length;

  metricsRoot.innerHTML = '';
  metricsRoot.append(
    buildMetric('Källor', data.totalSources),
    buildMetric('Visas', primaryCount),
    buildMetric('Ändrade', data.changedCount),
    buildMetric('Fel', data.errorCount),
    buildMetric('Intervall (min)', data.refreshMinutes)
  );
}

function buildBadge(source) {
  if (source.status === 'error') return { text: 'Fel', className: 'badge error' };
  if (source.changed) return { text: 'Uppdaterad', className: 'badge changed' };
  return { text: 'Oförändrad', className: 'badge ok' };
}

function renderSources(data) {
  grid.innerHTML = '';
  secondaryList.innerHTML = '';

  const primarySources = data.sources.filter((source) => source.status === 'ok' && source.lines.length > 0);
  const secondarySources = data.sources.filter((source) => !(source.status === 'ok' && source.lines.length > 0));

  for (const source of primarySources) {
    const node = template.content.firstElementChild.cloneNode(true);
    const badge = buildBadge(source);

    node.querySelector('h3').textContent = source.name;

    const badgeNode = node.querySelector('.badge');
    badgeNode.className = badge.className;
    badgeNode.textContent = badge.text;

    const link = node.querySelector('.source-link');
    link.href = source.url;

    node.querySelector('.stamp').textContent = `Senast läst: ${fmt(source.updatedAt)}`;

    const err = node.querySelector('.error');
    if (source.status === 'error') {
      err.textContent = `Kunde inte hämta nytt innehåll: ${source.error}`;
      err.classList.remove('hidden');
    }

    const lines = node.querySelector('.line-list');
    for (const text of source.lines.slice(0, 6)) {
      const li = document.createElement('li');
      li.textContent = text;
      lines.append(li);
    }

    if (source.key === 'kia') {
      const li = document.createElement('li');
      li.textContent = 'Obs: Kia-raderna kommer ofta utan modellnamn i källans sidtext.';
      lines.append(li);
    }

    node.querySelector('.tco').textContent = source.tco;
    grid.append(node);
  }

  if (!primarySources.length) {
    secondaryList.innerHTML = '<article class="compact-card">Inga källor med tydlig pris/ränta-data just nu.</article>';
  }

  for (const source of secondarySources) {
    const row = document.createElement('article');
    row.className = 'compact-card';

    const reason = source.status === 'error'
      ? `Hämtfel: ${source.error}`
      : source.emptyHint || 'Inga pris/ränta-rader hittades i aktuell källa.';

    row.innerHTML = `
      <div class="compact-top">
        <h3>${source.name}</h3>
        <a class="source-link" href="${source.url}" target="_blank" rel="noreferrer">Öppna källa</a>
      </div>
      <p class="stamp">Senast läst: ${fmt(source.updatedAt)}</p>
      <p class="compact-reason">${reason}</p>
    `;
    secondaryList.append(row);
  }
}

async function loadStatus() {
  const res = await fetch(statusUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Statusfel ${res.status}`);
  const data = await res.json();

  lastUpdated.textContent = fmt(data.generatedAt);
  nextRefresh.textContent = fmt(data.nextRefreshAt);

  renderMetrics(data);
  renderSources(data);
}

async function runNow() {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Uppdaterar...';

  try {
    const res = await fetch(runUrl, { method: 'POST' });
    if (!res.ok) throw new Error(`Körning misslyckades (${res.status})`);
    await loadStatus();
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Okänt fel vid körning');
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Uppdatera nu';
  }
}

refreshButton.addEventListener('click', runNow);

loadStatus().catch((err) => {
  console.error(err);
});

setInterval(() => {
  loadStatus().catch((err) => {
    console.error('Kunde inte uppdatera vy:', err);
  });
}, 30_000);
