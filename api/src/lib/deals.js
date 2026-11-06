// Turns the stored HubSpot deals into the rows the page shows, applying the tracker's rules.
const cfg = require('./config');
const names = require('./names');

// HubSpot's workflow webhook can send either flat values ({ dealname: "..." }) or its full record format
// ({ objectId, properties: { dealname: { value: "..." } } }). Both become a flat { property: value } map.
function parseWebhook(body) {
  if (!body || typeof body !== 'object') return null;
  const source = body.properties && typeof body.properties === 'object' ? body.properties : body;
  const props = {};
  for (const name of cfg.dealProperties) {
    let v = source[name];
    if (v && typeof v === 'object') v = v.value;
    if (v !== undefined && v !== null) props[name] = String(v).trim();
  }
  const id = String(body.objectId || body.hs_object_id || props.hs_object_id || '').trim();
  if (!/^\d+$/.test(id)) return null;
  props.hs_object_id = id;
  return { id, props };
}

const isoDay = (d) => d.toISOString().slice(0, 10);
const day = (v) => {
  if (!v) return '';
  if (/^\d+$/.test(v)) return isoDay(new Date(Number(v))); // HubSpot sometimes sends dates as milliseconds
  return v.slice(0, 10);
};
const label = (prop, v) => (v ? (names.labels[prop] && names.labels[prop][v]) || v : '');

function isOpen(p) {
  if (!p.consent_owner) return false;
  if (p.risc_la_collected !== 'Yes') return false; // only deals with the RISC/LA collected
  if (cfg.completedConsentValues.includes(p.consent__status)) return false;
  if (cfg.excludedStageIds.includes(p.dealstage)) return false;
  const stage = (names.stages[p.dealstage] || '').toLowerCase();
  if (cfg.excludedStageWords.some((w) => stage.includes(w))) return false;
  return true;
}

function toRows(deals, tab, today = new Date()) {
  const filed = tab === 'filed';
  const from = isoDay(today);
  const to = isoDay(new Date(today.getTime() + cfg.urgency.trialWindowDays * 864e5));
  const rows = [];
  for (const { id, props: p } of deals) {
    if (!isOpen(p)) continue;
    const dateFiled = day(p.date_matter_filed);
    if (Boolean(dateFiled) !== filed) continue;
    const trial = day(p.trial_date);
    const settlement = p.pipeline === cfg.urgency.highPipelineId;
    const trialSoon = Boolean(trial) && trial >= from && trial <= to;
    rows.push({
      id,
      deal: (p.dealname || '').replace(/\s+/g, ' ').trim(),
      stage: names.stages[p.dealstage] || p.dealstage || '',
      pipeline: names.pipelines[p.pipeline] || p.pipeline || '',
      closed: names.closedStages.has(p.dealstage),
      owner: names.owners[p.consent_owner] || `Owner ${p.consent_owner}`,
      status: label('consent_status', p.consent_status),
      consentStatus: label('consent__status', p.consent__status),
      retainer: label('retainer_received', p.retainer_received),
      howConsent: label('all_parties_informed', p.all_parties_informed),
      riscLa: label('risc_la_collected', p.risc_la_collected),
      governmentId: label('government_id', p.government_id),
      correctionNeeded: label('buyer_co_buyer_rep_needed', p.buyer_co_buyer_rep_needed),
      dateFiled,
      trialDate: trial,
      clioMatter: p.clio_matter || '',
      plaintiff1: (p.plaintiff_1 || '').trim(),
      plaintiff2: (p.plaintiff_2 || '').trim(),
      pointOfContact: (p.point_of_contact || '').trim(),
      clioMatterId: /^\d+$/.test(p.matter_id || '') ? p.matter_id : '',
      urgency: settlement || trialSoon ? 'High' : filed ? 'Medium' : 'Low',
      urgencyReason: [settlement ? 'Settlement pipeline' : '', trialSoon ? `Trial ${trial}` : ''].filter(Boolean).join(', '),
      hubspotUrl: `https://app.hubspot.com/contacts/${cfg.hubspotPortalId()}/record/0-3/${id}`,
    });
  }
  return rows;
}

module.exports = { parseWebhook, toRows, isOpen };
