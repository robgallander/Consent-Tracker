const cfg = require('./config');
const { request } = require('./http');

// Clio uses OAuth. The site keeps a long-lived refresh token in its settings and trades it for a
// short-lived access token whenever the old one is about to expire.
let token = null;

async function accessToken() {
  if (token && token.expires > Date.now() + 60000) return token.value;
  const res = await request(`${cfg.clio.base()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: cfg.clio.clientId(),
      client_secret: cfg.clio.clientSecret(),
      refresh_token: cfg.clio.refreshToken(),
    }),
  }, 'Clio sign-in');
  token = { value: res.access_token, expires: Date.now() + (Number(res.expires_in) || 3600) * 1000 };
  return token.value;
}

const clio = async (path, query) => {
  const url = new URL(`${cfg.clio.base()}/api/v4/${path}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  return request(url, { headers: { Authorization: `Bearer ${await accessToken()}` } }, 'Clio');
};

const person = (role, c) => ({
  role,
  name: c.name || '',
  type: c.type || '',
  email: c.primary_email_address || '',
  phone: c.primary_phone_number || '',
});

async function matterContacts(matterId) {
  const [matter, rel] = await Promise.all([
    clio(`matters/${encodeURIComponent(matterId)}.json`, {
      fields: 'id,display_number,client{id,name,type,primary_email_address,primary_phone_number}',
    }),
    clio('relationships.json', {
      matter_id: String(matterId),
      fields: 'id,description,contact{id,name,type,primary_email_address,primary_phone_number}',
    }),
  ]);
  const m = (matter && (matter.data || matter)) || {};
  const contacts = [];
  if (m.client) contacts.push(person('Client', m.client));
  for (const r of rel.data || []) if (r.contact) contacts.push(person(r.description || 'Related contact', r.contact));
  return {
    matter: m.display_number || String(m.id || matterId),
    url: `${cfg.clio.base()}/nc/#/matters/${encodeURIComponent(matterId)}`,
    contacts,
  };
}

module.exports = { matterContacts };
