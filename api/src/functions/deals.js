const { app } = require('@azure/functions');
const { requireUser, fail } = require('../lib/http');
const { cached, clear } = require('../lib/cache');
const cfg = require('../lib/config');
const { allDeals } = require('../lib/store');
const { toRows } = require('../lib/deals');

const stored = () => cached('deals', cfg.cacheSeconds, allDeals);

// GET /api/deals?tab=prefiling|filed|dropped[&refresh=1]
app.http('deals', {
  methods: ['GET'],
  authLevel: 'anonymous', // Sign-in is enforced by Static Web Apps and by requireUser below.
  route: 'deals',
  handler: async (req, context) => {
    const denied = requireUser(req);
    if (denied) return denied;
    const tab = ['filed', 'dropped'].includes(req.query.get('tab')) ? req.query.get('tab') : 'prefiling';
    try {
      if (req.query.get('refresh') === '1') clear('deals');
      const deals = await stored();
      const lastUpdate = deals.reduce((m, d) => (d.receivedAt > m ? d.receivedAt : m), '');
      return { jsonBody: { tab, generatedAt: new Date().toISOString(), lastUpdate, storedDeals: deals.length, rows: toRows(deals, tab) } };
    } catch (err) {
      return fail(context, err);
    }
  },
});
