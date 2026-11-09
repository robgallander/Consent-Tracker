// Every rule the tracker applies lives here, so changing a business rule never means touching other code.

const env = (name, fallback) => {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing app setting ${name}. Add it under Environment variables in the Azure portal (or local.settings.json when running locally).`);
  }
  return v;
};

module.exports = {
  env,

  hubspotPortalId: () => env('HUBSPOT_PORTAL_ID', '8854200'),
  // The shared secret HubSpot's workflow sends in the x-tracker-key header.
  webhookKey: () => env('WEBHOOK_KEY'),
  // Azure Storage connection string. "memory" keeps deals in memory, for local testing only.
  storage: () => env('STORAGE_CONNECTION_STRING'),


  // A deal is "complete" once its Consent Status (internal name consent__status) is one of these.
  completedConsentValues: ['Consent from ALL Parties', 'No Consent Needed'],

  // Deals in these stages never appear: Case Settled, Closed, Fee Motion, Demand Settled,
  // Offer Letter Settled, Dismissed Case, Arbitration Closed.
  excludedStageIds: [
    '148011378', '1084046343', '148011377',
    '261384983', '260423037', '266764713', '1067020160',
  ],
  // A deal whose stage name contains one of these words is "dropped": it leaves the Pre-filing and
  // Filed tabs and shows on the Dropped tab instead. A new drop stage is picked up once its name is in names.js.
  droppedStageWords: ['drop'],

  urgency: {
    highPipelineId: '77637672', // Settlement
    trialWindowDays: 90,
  },

  // The deal properties the site keeps from each update. Anything else HubSpot sends is ignored.
  dealProperties: [
    'hs_object_id', 'hs_lastmodifieddate', 'dealname', 'dealstage', 'pipeline', 'consent_owner', 'consent_status',
    'consent__status', 'retainer_received', 'all_parties_informed', 'risc_la_collected', 'government_id',
    'buyer_co_buyer_rep_needed', 'date_matter_filed', 'trial_date', 'matter_id', 'clio_matter',
    'plaintiff_1', 'plaintiff_2', 'point_of_contact',
  ],

  cacheSeconds: Number(process.env.CACHE_SECONDS || 60),
};
