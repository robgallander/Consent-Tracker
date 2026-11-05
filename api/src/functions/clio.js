const { app } = require('@azure/functions');
const { requireUser, fail } = require('../lib/http');
const { matterContacts } = require('../lib/clio');

// GET /api/clio/{matterId}/contacts: the client and related contacts on one Clio matter.
app.http('clioContacts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'clio/{matterId}/contacts',
  handler: async (req, context) => {
    const denied = requireUser(req);
    if (denied) return denied;
    const id = req.params.matterId;
    if (!/^\d+$/.test(id)) return { status: 400, jsonBody: { error: 'Clio Matter ID must be a number.' } };
    try {
      return { jsonBody: await matterContacts(id) };
    } catch (err) {
      return fail(context, err);
    }
  },
});
