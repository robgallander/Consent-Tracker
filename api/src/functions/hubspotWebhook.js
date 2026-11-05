const { app } = require('@azure/functions');
const crypto = require('node:crypto');
const cfg = require('../lib/config');
const { parseWebhook } = require('../lib/deals');
const { saveDeal } = require('../lib/store');
const { clear } = require('../lib/cache');

const sameKey = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// POST /api/hubspot/deal: called by the HubSpot workflows each time a deal is sent.
// People don't sign in here; HubSpot proves itself with the shared key in the x-tracker-key header.
app.http('hubspotDeal', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'hubspot/deal',
  handler: async (req, context) => {
           const given = req.headers.get('x-tracker-key') || req.headers.get('trackerkey') || req.query.get('key');
       if (!sameKey(given, cfg.webhookKey())) {
      context.warn('Rejected a deal update with a missing or wrong key.');
      return { status: 400, jsonBody: { error: 'Missing or wrong x-tracker-key header.' } };
    }
    let body;
    try { body = await req.json(); } catch { return { status: 400, jsonBody: { error: 'The request body must be JSON.' } }; }
    const parsed = parseWebhook(body);
    if (!parsed) return { status: 400, jsonBody: { error: 'No deal ID found. Include the Record ID (hs_object_id) in the webhook.' } };
    try {
      const result = await saveDeal(parsed.id, parsed.props);
      clear('deals');
      return { jsonBody: { ok: true, deal: parsed.id, result } };
    } catch (err) {
      context.error(err);
      return { status: 500, jsonBody: { error: 'Could not save the deal. HubSpot will retry.' } };
    }
  },
});
