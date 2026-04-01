const statusUrl = '/api/status';
const runUrl = '/api/run';

const metricsRoot = document.getElementById('metrics');
const grid = document.getElementById('source-grid');
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
  metricsRoot.innerHTML = '';
  metricsRoot.append(
    buildMetric('Källor', data.totalSources),
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
  for (const source of data.sources) {
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
    if (!source.lines.length) {
      const li = document.createElement('li');
      li.textContent = 'Inga pris/ränta-rader hittades.';
      lines.append(li);
    } else {
      for (const text of source.lines.slice(0, 6)) {
        const li = document.createElement('li');
        li.textContent = text;
        lines.append(li);
      }
    }

    node.querySelector('.tco').textContent = source.tco;
    grid.append(node);
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
