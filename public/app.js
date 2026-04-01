const statusUrl = '/api/status';
const runUrl = '/api/run';

const metricsRoot = document.getElementById('metrics');
const bestRateRoot = document.getElementById('best-rate');
const recentCampaignsRoot = document.getElementById('recent-campaigns');
const expiringCampaignsRoot = document.getElementById('expiring-campaigns');
const campaignTable = document.getElementById('campaign-table');
const campaignEmpty = document.getElementById('campaign-empty');
const sourceGrid = document.getElementById('source-grid');
const secondaryList = document.getElementById('secondary-list');
const sourceTemplate = document.getElementById('source-template');

const refreshButton = document.getElementById('refresh-button');
const lastUpdated = document.getElementById('last-updated');
const nextRefresh = document.getElementById('next-refresh');

const searchInput = document.getElementById('search-input');
const brandFilter = document.getElementById('brand-filter');
const modelFilter = document.getElementById('model-filter');
const retailerFilter = document.getElementById('retailer-filter');
const offerFilter = document.getElementById('offer-filter');
const customerFilter = document.getElementById('customer-filter');
const qualityFilter = document.getElementById('quality-filter');
const sortFilter = document.getElementById('sort-filter');

let statusCache = null;

function fmt(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('sv-SE');
}

function fmtNum(value, decimals = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return value.toLocaleString('sv-SE', { maximumFractionDigits: decimals });
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

function renderSkeletons() {
  metricsRoot.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  bestRateRoot.innerHTML = '<div class="skeleton"></div>';
  recentCampaignsRoot.innerHTML = '<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>';
  expiringCampaignsRoot.innerHTML = '<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>';
  campaignTable.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
}

function renderMetrics(data) {
  metricsRoot.innerHTML = [
    buildKpi('Aktiva privatkampanjer', data.activePrivateCampaigns || 0, 'Endast verifierade private offers'),
    buildKpi('Bevakade märken', data.monitoredBrands || 0, 'Tillverkare och partners'),
    buildKpi('Senaste uppdatering', fmt(data.generatedAt), ''),
    buildKpi('Nästa schemalagda körning', fmt(data.nextRefreshAt), `Uppdatering var ${data.refreshMinutes} minut`),
  ].join('');
}

function badgeForOfferType(type) {
  const map = {
    Ränteerbjudande: 'Ränta',
    Privatleasing: 'Privatleasing',
    Bonus: 'Bonus',
    Lagerbil: 'Lagerbil',
    'Tillfälligt erbjudande': 'Tillfälligt erbjudande',
  };
  return map[type] || 'Kampanjpris';
}

function renderBestRate(bestRate) {
  if (!bestRate) {
    bestRateRoot.innerHTML = '<div class="empty-state">Inga aktiva ränteerbjudanden just nu. Bevakningen fortsätter automatiskt.</div>';
    return;
  }

  const rate = bestRate.interest_rate === null ? '-' : `${fmtNum(bestRate.interest_rate)} % ränta`;
  bestRateRoot.innerHTML = `
    <article class="signal-row">
      <div class="signal-main">
        <p class="signal-brand">${bestRate.brand}</p>
        <p class="signal-model">${bestRate.model}</p>
        <span class="type-badge">${badgeForOfferType(bestRate.offer_type)}</span>
      </div>
      <div class="signal-meta">
        <p class="kpi-value">${rate}</p>
        <p>${bestRate.retailer}</p>
        <p class="panel-meta">${bestRate.campaign_summary}</p>
      </div>
      <div class="signal-diff">
        <p class="panel-meta">Giltighet</p>
        <p>${bestRate.valid_to ? fmt(bestRate.valid_to) : 'Ej angiven'}</p>
      </div>
      <div class="signal-source">
        <p><a class="btn btn-primary" href="${bestRate.campaign_url}" target="_blank" rel="noreferrer">Öppna erbjudande</a></p>
      </div>
      <div></div>
    </article>
  `;
}

function renderCompactCampaignList(root, campaigns, emptyText) {
  if (!campaigns || !campaigns.length) {
    root.innerHTML = `<li class="empty-state">${emptyText}</li>`;
    return;
  }
  root.innerHTML = campaigns.map((campaign) => `
    <li class="compact-item">
      <p><strong>${campaign.brand} ${campaign.model}</strong> • ${campaign.retailer}</p>
      <p>${campaign.offer_type}${campaign.interest_rate !== null ? ` • ${fmtNum(campaign.interest_rate)} %` : ''}</p>
      <p class="panel-meta">Verifierad ${fmt(campaign.verified_at)}</p>
    </li>
  `).join('');
}

function sourceBadge(source) {
  if (source.status === 'error') return { text: 'Källa otillgänglig', cls: 'badge error' };
  if (source.changed) return { text: 'Uppdaterad', cls: 'badge changed' };
  return { text: 'Stabil', cls: 'badge ok' };
}

function renderSources(sources) {
  sourceGrid.innerHTML = '';
  secondaryList.innerHTML = '';

  const complete = sources.filter((source) => source.status === 'ok' && source.lines.length > 0);
  const fallback = sources.filter((source) => !(source.status === 'ok' && source.lines.length > 0));

  for (const source of complete) {
    const node = sourceTemplate.content.firstElementChild.cloneNode(true);
    const badge = sourceBadge(source);
    node.querySelector('h3').textContent = source.name;
    node.querySelector('.badge').className = badge.cls;
    node.querySelector('.badge').textContent = badge.text;
    node.querySelector('.source-link').href = source.url;
    node.querySelector('.stamp').textContent = `Senast verifierad: ${fmt(source.updatedAt)}`;
    node.querySelector('.change-info').textContent = source.changeSummary;
    const list = node.querySelector('.line-list');
    for (const line of source.lines.slice(0, 3)) {
      const li = document.createElement('li');
      li.textContent = line;
      list.append(li);
    }
    sourceGrid.append(node);
  }

  if (!complete.length) {
    sourceGrid.innerHTML = '<div class="empty-state">Inga källor med tydliga privatkampanjer just nu.</div>';
  }

  for (const source of fallback) {
    secondaryList.innerHTML += `
      <article class="source-card">
        <div class="card-head">
          <h3>${source.name}</h3>
          <span class="badge ok">Bevakas</span>
        </div>
        <a class="source-link" href="${source.url}" target="_blank" rel="noreferrer">Öppna källa</a>
        <p class="stamp">Senast verifierad: ${fmt(source.updatedAt)}</p>
        <p class="change-info">${source.emptyHint || 'Källa bevakas via innehållssignaler när direkta villkor saknas.'}</p>
      </article>
    `;
  }
}

function fillSelect(select, values, defaultLabel) {
  const options = [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'sv-SE'));
  select.innerHTML = `<option value="all">${defaultLabel}</option>` + options.map((v) => `<option value="${v}">${v}</option>`).join('');
}

function hasClearTerms(campaign) {
  return campaign.interest_rate !== null || campaign.monthly_price !== null || campaign.cash_deposit !== null || campaign.duration_months !== null;
}

function isCurrentlyValid(campaign) {
  if (!campaign.valid_to) return true;
  return new Date(campaign.valid_to) >= new Date();
}

function filterCampaigns(campaigns) {
  const q = searchInput.value.trim().toLowerCase();
  const brand = brandFilter.value;
  const model = modelFilter.value;
  const retailer = retailerFilter.value;
  const offerType = offerFilter.value;
  const customer = customerFilter.value;
  const quality = qualityFilter.value;

  return campaigns.filter((campaign) => {
    if (brand !== 'all' && campaign.brand !== brand) return false;
    if (model !== 'all' && campaign.model !== model) return false;
    if (retailer !== 'all' && campaign.retailer !== retailer) return false;
    if (offerType !== 'all' && campaign.offer_type !== offerType) return false;

    if (customer === 'private_purchase' && campaign.customer_type !== 'private_purchase') return false;
    if (customer === 'private_leasing' && campaign.customer_type !== 'private_leasing' && campaign.offer_type !== 'Privatleasing') return false;

    if (quality === 'rateOnly' && campaign.interest_rate === null) return false;
    if (quality === 'complete' && !hasClearTerms(campaign)) return false;
    if (quality === 'validNow' && !isCurrentlyValid(campaign)) return false;

    if (!q) return true;
    return [campaign.brand, campaign.model, campaign.retailer, campaign.campaign_summary, campaign.offer_type]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}

function completenessScore(campaign) {
  let score = 0;
  if (campaign.interest_rate !== null) score += 3;
  if (campaign.monthly_price !== null) score += 2;
  if (campaign.cash_deposit !== null) score += 1;
  if (campaign.duration_months !== null) score += 1;
  if (campaign.valid_to) score += 1;
  return score;
}

function sortCampaigns(campaigns) {
  const mode = sortFilter.value;
  if (mode === 'bestRate') {
    return [...campaigns].sort((a, b) => {
      const av = a.interest_rate ?? 999;
      const bv = b.interest_rate ?? 999;
      return av - bv;
    });
  }
  if (mode === 'expiring') {
    return [...campaigns].sort((a, b) => {
      const av = a.valid_to ? new Date(a.valid_to).getTime() : Number.POSITIVE_INFINITY;
      const bv = b.valid_to ? new Date(b.valid_to).getTime() : Number.POSITIVE_INFINITY;
      return av - bv;
    });
  }
  if (mode === 'complete') {
    return [...campaigns].sort((a, b) => completenessScore(b) - completenessScore(a));
  }
  return [...campaigns].sort((a, b) => new Date(b.verified_at) - new Date(a.verified_at));
}

function renderCampaignRows(campaigns) {
  if (!campaigns.length) {
    campaignTable.innerHTML = '';
    campaignEmpty.classList.remove('hidden');
    return;
  }

  campaignEmpty.classList.add('hidden');
  campaignTable.innerHTML = campaigns.map((campaign) => {
    const rate = campaign.interest_rate !== null ? `${fmtNum(campaign.interest_rate)} %` : '—';
    const monthly = campaign.monthly_price !== null ? `${fmtNum(campaign.monthly_price, 0)} kr/mån` : '—';
    const deposit = campaign.cash_deposit !== null ? `${fmtNum(campaign.cash_deposit)} %` : '—';
    const validity = campaign.valid_to ? fmt(campaign.valid_to) : 'Ej angiven';

    return `
      <article class="signal-row">
        <div class="signal-main">
          <p class="signal-brand">${campaign.brand}</p>
          <p class="signal-model">${campaign.model}</p>
          <p class="panel-meta">${campaign.retailer}</p>
        </div>
        <div class="signal-meta">
          <span class="type-badge">${badgeForOfferType(campaign.offer_type)}</span>
          <p><strong>${campaign.customer_type === 'policy' ? 'Policy' : campaign.offer_type === 'Privatleasing' ? 'Privatleasing' : 'Privatköp'}</strong></p>
          <p>${campaign.campaign_summary}</p>
        </div>
        <div class="signal-diff">
          <p class="kpi-value">${rate}</p>
          <p class="panel-meta">Månadskostnad: ${monthly}</p>
          <p class="panel-meta">Kontantinsats: ${deposit}</p>
        </div>
        <div class="signal-source">
          <p class="panel-meta">Giltig till: ${validity}</p>
          <p class="panel-meta">Senast verifierad: ${fmt(campaign.verified_at)}</p>
          <p class="panel-meta">Källa: ${campaign.source_name}</p>
          <p class="panel-meta">Confidence: ${fmtNum((campaign.confidence_score || 0) * 100, 0)}%</p>
        </div>
        <div class="signal-source">
          <a class="btn btn-primary" href="${campaign.campaign_url}" target="_blank" rel="noreferrer">Öppna kampanj</a>
        </div>
      </article>
    `;
  }).join('');
}

function hydrateFilters(campaigns) {
  fillSelect(brandFilter, campaigns.map((c) => c.brand), 'Alla märken');
  fillSelect(modelFilter, campaigns.map((c) => c.model), 'Alla modeller');
  fillSelect(retailerFilter, campaigns.map((c) => c.retailer), 'Alla återförsäljare');
  fillSelect(offerFilter, campaigns.map((c) => c.offer_type), 'Alla kampanjtyper');
}

function renderAll() {
  if (!statusCache) return;

  renderMetrics(statusCache);
  renderBestRate(statusCache.bestRate);
  renderCompactCampaignList(recentCampaignsRoot, statusCache.recentCampaigns || [], 'Inga nyligen uppdaterade kampanjer ännu.');
  renderCompactCampaignList(expiringCampaignsRoot, statusCache.expiringSoon || [], 'Inga kampanjer med tydligt utgångsdatum just nu.');
  renderSources(statusCache.sources || []);

  const base = (statusCache.campaigns || []).filter((campaign) => campaign.is_private_customer_offer || campaign.customer_type === 'policy');
  const filtered = filterCampaigns(base);
  const sorted = sortCampaigns(filtered);
  renderCampaignRows(sorted);
}

async function loadStatus() {
  const response = await fetch(statusUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Statusfel ${response.status}`);
  statusCache = await response.json();
  lastUpdated.textContent = fmt(statusCache.generatedAt);
  nextRefresh.textContent = fmt(statusCache.nextRefreshAt);
  hydrateFilters(statusCache.campaigns || []);
  renderAll();
}

async function runNow() {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Kontrollerar...';
  try {
    const response = await fetch(runUrl, { method: 'POST' });
    if (!response.ok) throw new Error(`Körning misslyckades (${response.status})`);
    await loadStatus();
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Okänt fel');
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Kontrollera nya kampanjer';
  }
}

for (const element of [searchInput, brandFilter, modelFilter, retailerFilter, offerFilter, customerFilter, qualityFilter, sortFilter]) {
  element.addEventListener('input', renderAll);
  element.addEventListener('change', renderAll);
}

refreshButton.addEventListener('click', runNow);

renderSkeletons();
loadStatus().catch((error) => {
  console.error(error);
  campaignTable.innerHTML = '';
  campaignEmpty.classList.remove('hidden');
  campaignEmpty.textContent = 'Kunde inte ladda kampanjdata just nu. Testa igen om en stund.';
});

setInterval(() => {
  loadStatus().catch((error) => {
    console.error('Kunde inte uppdatera vy:', error);
  });
}, 30_000);
