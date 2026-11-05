const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

process.env.WEBHOOK_KEY = 'k-123';
process.env.STORAGE_CONNECTION_STRING = 'memory';
process.env.CLIO_CLIENT_ID = 'id';
process.env.CLIO_CLIENT_SECRET = 'secret';
process.env.CLIO_REFRESH_TOKEN = 'refresh';
process.env.CACHE_SECONDS = '0';

// Stand-in for @azure/functions that records each handler so the tests can call it.
const handlers = {};
require.cache[require.resolve('@azure/functions', { paths: [path.join(__dirname, '..')] })] = {
  exports: { app: { http: (name, o) => { handlers[name] = o.handler; } } },
};
for (const f of ['deals', 'hubspotWebhook', 'clio']) require(`../src/functions/${f}`);

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
global.fetch = async (url) => {
  url = String(url);
  if (url.endsWith('/oauth/token')) return json({ access_token: 'tok', expires_in: 3600 });
  if (url.includes('/api/v4/matters/')) return json({ data: { id: 123, display_number: '26465-Kelley', client: { name: 'Jeff Kelley', type: 'Person' } } });
  if (url.includes('/api/v4/relationships.json')) return json({ data: [{ description: 'Co-buyer', contact: { name: 'Pat Kelley', type: 'Person' } }] });
  return json({ message: 'unexpected' }, 404);
};

const ctx = { warn() {}, error() {}, log() {} };
const principal = (roles) => Buffer.from(JSON.stringify({ userDetails: 'pat@firm.com', userRoles: roles })).toString('base64');
const getReq = (url, roles = ['anonymous', 'authenticated', 'tracker'], params = {}) => ({
  headers: new Headers(roles ? { 'x-ms-client-principal': principal(roles) } : {}),
  query: new URL(url, 'https://x').searchParams, params,
});
const post = (body, key = 'k-123') => ({
  headers: new Headers(key ? { 'x-tracker-key': key } : {}),
  json: async () => body,
});
const soon = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);

test('webhook rejects a missing or wrong key', async () => {
  assert.equal((await handlers.hubspotDeal(post({ objectId: 1 }, null), ctx)).status, 400);
  assert.equal((await handlers.hubspotDeal(post({ objectId: 1 }, 'nope'), ctx)).status, 400);
});

test('webhook accepts flat and full-record formats', async () => {
  const sends = [
    // Settlement pipeline, filed: High
    { hs_object_id: '1', dealname: 'Ann  v. Ford', pipeline: '77637672', dealstage: '148040364', consent_owner: '82580539', date_matter_filed: '2026-10-01', matter_id: '123', consent__status: 'Only Partial Consent Received', hs_lastmodifieddate: '2026-11-01T00:00:00Z' },
    // HubSpot full-record format, trial soon, filed: High
    { objectId: 2, properties: { dealname: { value: 'Bo v. Kia' }, pipeline: { value: '70128010' }, dealstage: { value: '135842574' }, consent_owner: { value: '96605527' }, date_matter_filed: { value: '2026-09-01' }, trial_date: { value: soon }, consent_status: { value: 'Retained' } } },
    // pre-filing, plain: Low
    { hs_object_id: '3', dealname: 'Cy v. GM', pipeline: '6906894', dealstage: '96740001', consent_owner: '82580535', all_parties_informed: 'Yes' },
    // excluded stage
    { hs_object_id: '4', dealname: 'Di v. VW', pipeline: '70128010', dealstage: '170672913', consent_owner: '82580535' },
    // consent complete
    { hs_object_id: '5', dealname: 'Ed v. BMW', pipeline: '70128010', dealstage: '135842574', consent_owner: '82580535', consent__status: 'Consent from ALL Parties', date_matter_filed: '2026-01-01' },
    // no consent owner
    { hs_object_id: '6', dealname: 'Fi v. Kia', dealstage: '135842574' },
    // unknown owner and a past trial: Medium, shows ID
    { hs_object_id: '7', dealname: 'Gu v. Ford', pipeline: '70128010', dealstage: '1067020146', consent_owner: '99', date_matter_filed: '1767225600000', trial_date: '2020-01-01' },
  ];
  for (const b of sends) {
    const res = await handlers.hubspotDeal(post(b), ctx);
    assert.equal(res.status, undefined, JSON.stringify(res.jsonBody));
  }
  assert.equal((await handlers.hubspotDeal(post({ dealname: 'no id' }), ctx)).status, 400);
});

test('an older update never overwrites a newer one', async () => {
  const res = await handlers.hubspotDeal(post({ hs_object_id: '1', dealname: 'OLD', hs_lastmodifieddate: '2026-10-01T00:00:00Z' }), ctx);
  assert.equal(res.jsonBody.result, 'skipped');
});

test('filed tab: rules, names and urgency', async () => {
  const res = await handlers.deals(getReq('/api/deals?tab=filed'), ctx);
  const rows = Object.fromEntries(res.jsonBody.rows.map((r) => [r.id, r]));
  assert.deepEqual(Object.keys(rows).sort(), ['1', '2', '7']);
  assert.equal(rows['1'].urgency, 'High');
  assert.equal(rows['1'].urgencyReason, 'Settlement pipeline');
  assert.equal(rows['1'].deal, 'Ann v. Ford');
  assert.equal(rows['1'].owner, 'Gail Alexis Lungay');
  assert.equal(rows['1'].consentStatus, 'In Progress');
  assert.equal(rows['1'].stage, 'Financials');
  assert.equal(rows['1'].clioMatterId, '123');
  assert.equal(rows['2'].urgency, 'High');
  assert.equal(rows['2'].status, 'Consent Received');
  assert.equal(rows['2'].owner, 'Jorge Santacruz');
  assert.equal(rows['7'].urgency, 'Medium');
  assert.equal(rows['7'].owner, 'Owner 99');
  assert.equal(rows['7'].dateFiled, '2026-01-01');
  assert.equal(res.jsonBody.storedDeals, 7);
  assert.ok(res.jsonBody.lastUpdate);
});

test('pre-filing tab', async () => {
  const res = await handlers.deals(getReq('/api/deals'), ctx);
  assert.deepEqual(res.jsonBody.rows.map((r) => [r.id, r.urgency, r.howConsent, r.stage]), [['3', 'Low', 'Call', 'RO Summary']]);
});

test('Clio contacts', async () => {
  const res = await handlers.clioContacts(getReq('/api/clio/123/contacts', undefined, { matterId: '123' }), ctx);
  assert.equal(res.jsonBody.matter, '26465-Kelley');
  assert.deepEqual(res.jsonBody.contacts.map((c) => c.role), ['Client', 'Co-buyer']);
});

test('only invited people can read deals', async () => {
  assert.equal((await handlers.deals(getReq('/api/deals', null), ctx)).status, 401);
  assert.equal((await handlers.deals(getReq('/api/deals', ['anonymous', 'authenticated']), ctx)).status, 403);
  assert.equal((await handlers.clioContacts(getReq('/x', ['authenticated'], { matterId: '1' }), ctx)).status, 403);
});
