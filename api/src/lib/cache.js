// Tiny in-memory cache. Each Functions instance keeps its own copy, which is fine for a few minutes of freshness.
const store = new Map();

async function cached(key, seconds, load) {
  const hit = store.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  if (hit && hit.pending) return hit.pending;
  const pending = load().then(
    (value) => { store.set(key, { value, until: Date.now() + seconds * 1000 }); return value; },
    (err) => { store.delete(key); throw err; },
  );
  store.set(key, { pending, until: 0 });
  return pending;
}

const clear = (prefix = '') => { for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k); };

module.exports = { cached, clear };
