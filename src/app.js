'use strict';

const COLUMNS = {
  prefiling: [
    ['urgency', 'Urgency', ''], ['deal', 'Deal', 'Deal'], ['stage', 'Deal stage', 'Deal'], ['owner', 'Consent owner', 'Deal'],
    ['status', 'Status', 'Client'], ['consentStatus', 'Consent status', 'Client'], ['retainer', 'Retainer received', 'Client'], ['howConsent', 'How consent obtained', 'Client'],
    ['riscLa', 'RISC/LA collected', 'Documents'], ['governmentId', 'Government ID', 'Documents'], ['correctionNeeded', 'Correction RA/DAR needed', 'Documents'],
  ],
};
COLUMNS.filed = [
  ...COLUMNS.prefiling.slice(0, 4),
  ['dateFiled', 'Date filed', 'Deal'], ['trialDate', 'Trial date', 'Deal'], ['clioMatter', 'Clio matter', 'Deal'],
  ...COLUMNS.prefiling.slice(4),
];

const RULES = {
  prefiling: 'Deals with a Consent Owner and no Date Matter Filed whose Consent Status isn’t yet “ALL Parties Consented” or “No Consent Needed”. Urgency is High in the Settlement pipeline or with a trial in the next 90 days, otherwise Low.',
  filed: 'Deals with a Consent Owner and a Date Matter Filed whose Consent Status isn’t yet “ALL Parties Consented” or “No Consent Needed”. Urgency is High in the Settlement pipeline or with a trial in the next 90 days, otherwise Medium.',
};
const RANK = { High: 0, Medium: 1, Low: 2 };
const fmt = new Intl.NumberFormat('en-US');
const $ = (id) => document.getElementById(id);

const state = {
  tab: location.hash === '#filed' ? 'filed' : 'prefiling',
  data: {},
  errors: {},
  open: null,
  filters: { prefiling: {}, filed: {} },
  sort: { prefiling: { col: 'urgency', dir: 1 }, filed: { col: 'urgency', dir: 1 } },
  clio: new Map(),
};

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return n;
}

async function api(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (res.status === 401) { location.href = '/.auth/login/aad?post_login_redirect_uri=/'; throw new Error('Signing you in'); }
  if (res.status === 403) { location.href = '/no-access.html'; throw new Error('No access'); }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new Error((body && body.error) || `The server answered ${res.status}.`);
  return body;
}

async function load(tab, refresh = false) {
  state.errors[tab] = null;
  if (tab === state.tab) $('sync').textContent = 'Loading deals';
  try {
    state.data[tab] = await api(`/api/deals?tab=${tab}${refresh ? '&refresh=1' : ''}`);
  } catch (err) {
    state.errors[tab] = err.message;
  }
  render();
}

function rowsFor(tab) {
  const data = state.data[tab];
  if (!data) return [];
  const f = state.filters[tab];
  const q = (f.q || '').toLowerCase();
  let rows = data.rows.filter((r) =>
    (!f.urgency || r.urgency === f.urgency) &&
    (!f.owner || (r.owner || 'Not set') === f.owner) &&
    (!f.status || (r.consentStatus || 'Not set') === f.status) &&
    (!f.hideClosed || !r.closed) &&
    (!q || `${r.deal} ${r.clioMatter} ${r.owner}`.toLowerCase().includes(q)));
  const { col, dir } = state.sort[tab];
  const key = (r) => (col === 'urgency' ? String(RANK[r.urgency]) : String(r[col] || '\uffff'));
  rows = rows.slice().sort((a, b) => dir * key(a).localeCompare(key(b), 'en', { numeric: true }) || a.deal.localeCompare(b.deal));
  return rows;
}

function countBy(rows, field) {
  const n = new Map();
  for (const r of rows) { const k = r[field] || 'Not set'; n.set(k, (n.get(k) || 0) + 1); }
  return [...n].sort((a, b) => b[1] - a[1]);
}

function render() {
  const tab = state.tab;
  const data = state.data[tab];
  const error = state.errors[tab];

  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  $('panel').setAttribute('aria-labelledby', `tab-${tab}`);
  for (const t of ['prefiling', 'filed']) {
    document.querySelector(`[data-count="${t}"]`).textContent = state.data[t] ? fmt.format(state.data[t].rows.length) : '';
  }
  $('rule').textContent = RULES[tab];
  $('sync').textContent = error ? `Couldn’t load deals: ${error}`
    : !data ? 'Loading deals'
    : !data.storedDeals ? 'No deals have arrived from HubSpot yet. Turn on the HubSpot workflows to send them.'
    : `Last change from HubSpot ${new Date(data.lastUpdate).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;

  const all = data ? data.rows : [];
  renderTiles(all, !!data);
  renderBars('by-status', countBy(all, 'consentStatus'), 'status');
  renderBars('by-owner', countBy(all, 'owner'), 'owner');
  renderFilters(all);
  renderTable(data, error);
}

function renderTiles(rows, ready) {
  const v = (n) => (ready ? fmt.format(n) : '–');
  const tiles = [
    ['High urgency', rows.filter((r) => r.urgency === 'High').length, 'urgent'],
    ['Waiting on consent', rows.length],
    ['Retainer not received', rows.filter((r) => r.retainer !== 'Yes').length],
    ['Correction RA/DAR needed', rows.filter((r) => r.correctionNeeded === 'Yes').length],
    ['Government ID not collected', rows.filter((r) => !r.governmentId || r.governmentId === 'Not Collected').length],
  ];
  $('tiles').replaceChildren(...tiles.map(([label, n, cls]) => el('div', { class: `tile ${cls || ''}` }, el('b', {}, v(n)), el('span', {}, label))));
}

function renderBars(id, counts, filterKey) {
  const box = $(id);
  if (!counts.length) { box.replaceChildren(el('p', { class: 'note' }, state.data[state.tab] ? 'No deals.' : 'Loading')); return; }
  const max = counts[0][1];
  const f = state.filters[state.tab];
  box.replaceChildren(...counts.map(([label, n]) => {
    const fill = el('span', { class: 'fill' });
    fill.style.width = `${(100 * n) / max}%`;
    return el('button', {
      type: 'button', 'aria-pressed': String(f[filterKey] === label),
      onclick: () => { f[filterKey] = f[filterKey] === label ? '' : label; state.open = null; render(); },
    }, el('span', { class: 'label', title: label }, label), el('span', { class: 'track' }, fill), el('span', { class: 'n' }, fmt.format(n)));
  }));
}

function fillSelect(sel, allLabel, options, value) {
  sel.replaceChildren(el('option', { value: '' }, allLabel), ...options.map(([v, label]) => el('option', { value: v }, label)));
  sel.value = value || '';
}

function renderFilters(rows) {
  const tab = state.tab;
  const f = state.filters[tab];
  const urg = countBy(rows, 'urgency').sort((a, b) => RANK[a[0]] - RANK[b[0]]);
  fillSelect($('f-urgency'), 'All urgencies', urg.map(([k, n]) => [k, `${k} (${fmt.format(n)})`]), f.urgency);
  fillSelect($('f-owner'), 'All consent owners', countBy(rows, 'owner').map(([k, n]) => [k, `${k} (${fmt.format(n)})`]), f.owner);
  fillSelect($('f-status'), 'All consent statuses', countBy(rows, 'consentStatus').map(([k, n]) => [k, `${k} (${fmt.format(n)})`]), f.status);
  $('f-closed').checked = !!f.hideClosed;
  $('q').value = f.q || '';
}

function renderTable(data, error) {
  const tab = state.tab;
  const cols = COLUMNS[tab];
  const { col, dir } = state.sort[tab];

  const groups = [];
  for (const [, , g] of cols) {
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1]++; else groups.push([g, 1]);
  }
  $('thead').replaceChildren(
    el('tr', { class: 'groups' }, groups.map(([g, n]) => el('th', { colspan: n, scope: 'colgroup' }, g))),
    el('tr', { class: 'cols' }, cols.map(([key, label]) => el('th', {
      scope: 'col', 'data-sort': key, 'aria-sort': key === col ? (dir === 1 ? 'ascending' : 'descending') : 'none',
      tabindex: 0,
      onclick: () => sortBy(key),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(key); } },
    }, label))),
  );

  const body = $('tbody');
  if (error) { body.replaceChildren(el('tr', {}, el('td', { colspan: cols.length, class: 'empty' }, `Couldn’t load deals. ${error} Select Reload to try again.`))); $('shown').textContent = ''; return; }
  if (!data) { body.replaceChildren(el('tr', {}, el('td', { colspan: cols.length, class: 'empty' }, 'Loading deals'))); $('shown').textContent = ''; return; }

  const rows = rowsFor(tab);
  $('shown').textContent = `${fmt.format(rows.length)} of ${fmt.format(data.rows.length)} shown`;
  if (!rows.length) { body.replaceChildren(el('tr', {}, el('td', { colspan: cols.length, class: 'empty' }, 'No deals match these filters.'))); return; }

  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const open = state.open === r.id;
    frag.append(el('tr', {
      class: 'row', tabindex: 0, 'aria-expanded': String(open), 'data-id': r.id,
    }, cols.map(([key]) => {
      if (key === 'urgency') return el('td', { class: `urg ${r.urgency}`, title: r.urgencyReason || null }, r.urgency);
      if (key === 'deal') return el('td', { class: 'deal' }, r.deal);
      if (key === 'correctionNeeded' && r[key] === 'Yes') return el('td', { class: 'warn' }, 'Yes');
      return el('td', {}, r[key] || '');
    })));
    if (open) frag.append(el('tr', { class: 'detail' }, el('td', { colspan: cols.length }, detailPanel(r))));
  }
  body.replaceChildren(frag);
}

function sortBy(key) {
  const s = state.sort[state.tab];
  s.dir = s.col === key ? -s.dir : 1;
  s.col = key;
  render();
}

function people(list, lines) {
  return el('ul', { class: 'people' }, list.map((p) => el('li', {}, el('b', {}, p.name), lines(p).filter(Boolean).map((l) => el('span', {}, l)))));
}

function detailPanel(r) {
  const facts = [
    `Urgency: ${r.urgency}${r.urgencyReason ? ` (${r.urgencyReason})` : ''}`,
    r.pipeline && `${r.pipeline} pipeline`, r.stage, r.trialDate && `Trial ${r.trialDate}`,
    `Consent owner: ${r.owner || 'not set'}`, `Consent status: ${r.consentStatus || 'not set'}`,
  ].filter(Boolean).join('  |  ');

  const clioBox = el('div', {}, el('h4', {}, 'Clio contacts'));
  if (!r.clioMatterId) {
    clioBox.append(el('p', { class: 'note' }, r.clioMatter
      ? `This deal has Clio matter ${r.clioMatter} but no Clio Matter ID in HubSpot. Add the ID to look up its contacts.`
      : 'No Clio Matter ID is set on this deal in HubSpot.'));
  } else {
    const c = state.clio.get(r.clioMatterId);
    if (c && c.url) clioBox.firstChild.append(el('a', { href: c.url, target: '_blank', rel: 'noopener' }, `Open matter ${c.matter} in Clio`));
    if (!c) clioBox.append(el('p', { class: 'loading' }, 'Loading contacts from Clio'));
    else if (c.error) clioBox.append(el('p', { class: 'error' }, `Couldn’t load Clio contacts. ${c.error}`));
    else if (!c.contacts.length) clioBox.append(el('p', { class: 'note' }, 'This matter has no contacts in Clio.'));
    else clioBox.append(people(c.contacts, (p) => [`${p.role}${p.type ? `, ${p.type}` : ''}`, p.email, p.phone]));
  }

  return el('div', { class: 'panel' },
    el('div', { class: 'panel-head' },
      el('div', {}, el('h3', {}, r.deal), el('p', { class: 'facts' }, facts),
        el('p', { class: 'facts' }, el('a', { href: r.hubspotUrl, target: '_blank', rel: 'noopener' }, 'Open deal in HubSpot'))),
      el('button', { type: 'button', onclick: () => toggle(r.id) }, 'Close')),
    el('div', { class: 'cols' }, clioBox));
}

async function toggle(id) {
  state.open = state.open === id ? null : id;
  render();
  if (!state.open) return;
  const r = state.data[state.tab].rows.find((x) => x.id === id);
  const row = document.querySelector(`tr.row[data-id="${id}"]`);
  if (row) row.scrollIntoView({ block: 'nearest' });
  const jobs = [];
  if (r && r.clioMatterId && !state.clio.has(r.clioMatterId)) {
    jobs.push(api(`/api/clio/${r.clioMatterId}/contacts`)
      .then((b) => state.clio.set(r.clioMatterId, b), (e) => state.clio.set(r.clioMatterId, { error: e.message })));
  }
  for (const j of jobs) j.then(() => { if (state.open === id) render(); });
}

function downloadCsv() {
  const tab = state.tab;
  const cols = COLUMNS[tab];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.map(([, label]) => esc(label)).join(','), ...rowsFor(tab).map((r) => cols.map(([k]) => esc(r[k])).join(','))];
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' }));
  const a = el('a', { href: url, download: `consent-tracker-${tab}-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wire() {
  for (const b of document.querySelectorAll('.tabs button')) {
    b.addEventListener('click', () => {
      state.tab = b.dataset.tab; state.open = null;
      history.replaceState(null, '', state.tab === 'filed' ? '#filed' : '#');
      render();
    });
  }
  const f = () => state.filters[state.tab];
  $('q').addEventListener('input', (e) => { f().q = e.target.value.trim(); state.open = null; renderTable(state.data[state.tab], state.errors[state.tab]); });
  $('f-urgency').addEventListener('change', (e) => { f().urgency = e.target.value; state.open = null; render(); });
  $('f-owner').addEventListener('change', (e) => { f().owner = e.target.value; state.open = null; render(); });
  $('f-status').addEventListener('change', (e) => { f().status = e.target.value; state.open = null; render(); });
  $('f-closed').addEventListener('change', (e) => { f().hideClosed = e.target.checked; state.open = null; render(); });
  $('clear').addEventListener('click', () => { state.filters[state.tab] = {}; state.open = null; render(); });
  $('csv').addEventListener('click', downloadCsv);
  $('refresh').addEventListener('click', () => { state.clio.clear(); load('prefiling', true); load('filed', true); });

  const tbody = $('tbody');
  tbody.addEventListener('click', (e) => {
    if (e.target.closest('tr.detail')) return;
    const tr = e.target.closest('tr.row');
    if (tr) toggle(tr.dataset.id);
  });
  tbody.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr.row');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(tr.dataset.id); }
  });
}

async function who() {
  try {
    const me = await (await fetch('/.auth/me')).json();
    const p = me && me.clientPrincipal;
    if (p) $('who').textContent = p.userDetails;
  } catch { /* the name is a nicety */ }
}

wire();
render();
who();
load('prefiling');
load('filed');
