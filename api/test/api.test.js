const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

process.env.WEBHOOK_KEY = 'k-123';
process.env.STORAGE_CONNECTION_STRING = 'memory';
process.env.CACHE_SECONDS = '0';

// Stand-in for @azure/functions that records each handler so the tests can call it.
const handlers = {};
require.cache[require.resolve('@azure/functions', { paths: [path.join(__dirname, '..')] })] = {
  exports: { app: { http: (name, o) => { handlers[name] = o.handler; } } },
};
for (const f of ['deals', 'hubspotWebhook']) require(`../src/functions/${f}`);

const ctx = { warn() {}, error() {}, log() {} };
const principal = (roles) => Buffer.from(JSON.stringify({ userDetails: 'pat@firm.com', userRoles: roles })).toString('base64');
const getReq = (url, roles = ['anonymous', 'authenticated', 'tracker'], params = {}) => ({
  headers: new Headers(roles ? { 'x-ms-client-principal': principal(roles) } : {}),
  query: new URL(url, 'https://x').searchParams, params,
});
const post = (body, key = 'k-123', header = 'x-tracker-key', query = '') => ({
  headers: new Headers(key ? { [header]: key } : {}),
  query: new URLSearchParams(query),
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
    { hs_object_id: '1', risc_la_collected: 'Yes', plaintiff_1: 'Ann Lee ', plaintiff_2: 'Bo Lee', point_of_contact: 'Cy Diaz', dealname: 'Ann  v. Ford', pipeline: '77637672', dealstage: '148040364', consent_owner: '82580539', date_matter_filed: '2026-10-01', matter_id: '123', consent__status: 'Only Partial Consent Received', hs_lastmodifieddate: '2026-11-01T00:00:00Z' },
    // HubSpot full-record format, trial soon, filed: High
    { objectId: 2, properties: { risc_la_collected: { value: 'Yes' }, dealname: { value: 'Bo v. Kia' }, pipeline: { value: '70128010' }, dealstage: { value: '135842574' }, consent_owner: { value: '96605527' }, date_matter_filed: { value: '2026-09-01' }, trial_date: { value: soon }, consent_status: { value: 'Retained' } } },
    // pre-filing, plain: Low
    { hs_object_id: '3', risc_la_collected: 'Yes', dealname: 'Cy v. GM', pipeline: '6906894', dealstage: '96740001', consent_owner: '82580535', all_parties_informed: 'Yes' },
    // RISC/LA not collected: hidden
    { hs_object_id: '10', dealname: 'Jo v. Kia', pipeline: '6906894', dealstage: '96740001', consent_owner: '82580535', risc_la_collected: 'In Progress' },
    // excluded stage
    { hs_object_id: '4', dealname: 'Di v. VW', pipeline: '70128010', dealstage: '170672913', consent_owner: '82580535' },
    // consent complete
    { hs_object_id: '5', dealname: 'Ed v. BMW', pipeline: '70128010', dealstage: '135842574', consent_owner: '82580535', consent__status: 'Consent from ALL Parties', date_matter_filed: '2026-01-01' },
    // no consent owner
    { hs_object_id: '6', dealname: 'Fi v. Kia', dealstage: '135842574' },
    // dropped, filed: Dropped tab only
    { hs_object_id: '11', risc_la_collected: 'Yes', dealname: 'Ky v. Ford', pipeline: '70128010', dealstage: '155189872', consent_owner: '82580535', date_matter_filed: '2026-03-01' },
    // dropped, not filed: Dropped tab only
    { hs_object_id: '12', risc_la_collected: 'Yes', dealname: 'Lu v. Kia', pipeline: '6906894', dealstage: '96740002', consent_owner: '82580535' },
    // dropped but consent complete: hidden everywhere
    { hs_object_id: '13', risc_la_collected: 'Yes', dealname: 'Mo v. GM', pipeline: '6906894', dealstage: '96740002', consent_owner: '82580535', consent__status: 'No Consent Needed' },
    // unknown owner and a past trial: Medium, shows ID
    { hs_object_id: '7', risc_la_collected: 'Yes', dealname: 'Gu v. Ford', pipeline: '70128010', dealstage: '1067020146', consent_owner: '99', date_matter_filed: '1767225600000', trial_date: '2020-01-01' },
  ];
  for (const b of sends) {
    const res = await handlers.hubspotDeal(post(b), ctx);
    assert.equal(res.status, undefined, JSON.stringify(res.jsonBody));
  }
  assert.equal((await handlers.hubspotDeal(post({ dealname: 'no id' }), ctx)).status, 400);
});

test('webhook also accepts a letters-only header or ?key=', async () => {
  assert.equal((await handlers.hubspotDeal(post({ hs_object_id: '8', dealname: 'Hy' }, 'k-123', 'trackerkey'), ctx)).status, undefined);
  assert.equal((await handlers.hubspotDeal(post({ hs_object_id: '9', dealname: 'Iz' }, null, 'x', 'key=k-123'), ctx)).status, undefined);
  assert.equal((await handlers.hubspotDeal(post({ hs_object_id: '9' }, null, 'x', 'key=bad'), ctx)).status, 400);
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
  assert.deepEqual([rows['1'].plaintiff1, rows['1'].plaintiff2, rows['1'].pointOfContact], ['Ann Lee', 'Bo Lee', 'Cy Diaz']);
  assert.equal(rows['2'].plaintiff1, '');
  assert.equal(rows['2'].urgency, 'High');
  assert.equal(rows['2'].status, 'Consent Received');
  assert.equal(rows['2'].owner, 'Jorge Santacruz');
  assert.equal(rows['7'].urgency, 'Medium');
  assert.equal(rows['7'].owner, 'Owner 99');
  assert.equal(rows['7'].dateFiled, '2026-01-01');
  assert.equal(res.jsonBody.storedDeals, 13);
  assert.ok(res.jsonBody.lastUpdate);
});

test('pre-filing tab', async () => {
  const res = await handlers.deals(getReq('/api/deals'), ctx);
  assert.deepEqual(res.jsonBody.rows.map((r) => [r.id, r.urgency, r.howConsent, r.stage]), [['3', 'Low', 'Call', 'RO Summary']]);
});

test('dropped tab: deals in any stage with "Drop" in its name, filed or not', async () => {
  const res = await handlers.deals(getReq('/api/deals?tab=dropped'), ctx);
  assert.deepEqual(res.jsonBody.rows.map((r) => [r.id, r.urgency, r.stage]).sort(),
    [['11', 'Medium', 'Drop Case (Repurchase)'], ['12', 'Low', 'Drop Case (Non-Responsive)']]);
});

test('only invited people can read deals', async () => {
  assert.equal((await handlers.deals(getReq('/api/deals', null), ctx)).status, 401);
  assert.equal((await handlers.deals(getReq('/api/deals', ['anonymous', 'authenticated']), ctx)).status, 403);
});
