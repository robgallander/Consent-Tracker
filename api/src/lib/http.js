// fetch with retries for rate limits (429) and brief upstream hiccups (5xx).
async function request(url, options = {}, label = 'Request') {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res.status === 204 ? null : res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < 4) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait, 10000)));
      continue;
    }
    let detail = '';
    try { const body = await res.json(); detail = body.message || (body.error && (body.error.message || body.error)) || ''; } catch { /* not JSON */ }
    const err = new Error(`${label} failed (${res.status})${detail ? `: ${detail}` : ''}`);
    err.status = res.status;
    throw err;
  }
}

// Static Web Apps adds this header to requests from signed-in people.
function principal(req) {
  const raw = req.headers.get('x-ms-client-principal');
  if (!raw) return null;
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch { return null; }
}

// The role people get when you invite them under Role Management in the Azure portal.
const ACCESS_ROLE = 'tracker';

// Every API function calls this first. The site's route rules already block anyone without the role;
// this repeats the check so the data is never served even if those rules are edited by mistake.
function requireUser(req) {
  const p = principal(req);
  if (!p) return { status: 401, jsonBody: { error: 'Sign in to use the tracker.' } };
  if (!(p.userRoles || []).includes(ACCESS_ROLE)) {
    return { status: 403, jsonBody: { error: 'Your account has not been given access to the tracker. Ask an administrator to invite you.' } };
  }
  return null;
}

const fail = (context, err) => {
  context.error(err);
  return { status: err.status === 404 ? 404 : 502, jsonBody: { error: err.message } };
};

module.exports = { request, requireUser, fail, ACCESS_ROLE };
