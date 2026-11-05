// Where the site keeps its copy of each deal: one row per deal in an Azure Storage table called "Deals".
const cfg = require('./config');

const TABLE = 'Deals';
const PARTITION = 'deal';
let backend = null;

function memoryBackend() {
  const rows = new Map();
  return {
    async get(id) { return rows.get(id) || null; },
    async put(row) { rows.set(row.rowKey, { ...row }); },
    async list() { return [...rows.values()]; },
  };
}

function tableBackend(connectionString) {
  const { TableClient } = require('@azure/data-tables');
  const client = TableClient.fromConnectionString(connectionString, TABLE);
  let ready = null;
  const init = () => (ready = ready || client.createTable().catch((e) => { if (e.statusCode !== 409) { ready = null; throw e; } }));
  return {
    async get(id) {
      await init();
      try { return await client.getEntity(PARTITION, id); } catch (e) { if (e.statusCode === 404) return null; throw e; }
    },
    async put(row) { await init(); await client.upsertEntity(row, 'Replace'); },
    async list() {
      await init();
      const out = [];
      for await (const e of client.listEntities({ queryOptions: { filter: `PartitionKey eq '${PARTITION}'` } })) out.push(e);
      return out;
    },
  };
}

function db() {
  if (!backend) {
    const cs = cfg.storage();
    backend = cs === 'memory' ? memoryBackend() : tableBackend(cs);
  }
  return backend;
}

const toRow = (id, props, receivedAt) => ({ partitionKey: PARTITION, rowKey: id, receivedAt, data: JSON.stringify(props) });
const fromRow = (row) => ({ id: row.rowKey, receivedAt: row.receivedAt, props: JSON.parse(row.data || '{}') });

// Saves a deal unless the copy already stored is newer (HubSpot can deliver updates out of order).
async function saveDeal(id, props) {
  const existing = await db().get(id);
  if (existing) {
    const stored = fromRow(existing).props.hs_lastmodifieddate;
    if (stored && props.hs_lastmodifieddate && new Date(stored) > new Date(props.hs_lastmodifieddate)) return 'skipped';
  }
  await db().put(toRow(id, props, new Date().toISOString()));
  return existing ? 'updated' : 'added';
}

async function allDeals() { return (await db().list()).map(fromRow); }

module.exports = { saveDeal, allDeals, _reset: () => { backend = null; } };
