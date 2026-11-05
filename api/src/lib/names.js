// HubSpot sends internal values (IDs and option values). These lists turn them into the names people see.
// Taken from HubSpot on 2026-11-05. When you add a stage, pipeline, dropdown option or consent owner in
// HubSpot, add it here too. Until then the site shows the raw value instead of breaking.

const pipelines = {
  6906894: 'Document Gathering',
  77637672: 'Settlement',
  147213186: 'Pre-Litigation',
  70128010: 'Litigation',
};

const stages = {
  // Document Gathering
  31784857: 'Retained Client', 31784858: 'Gathering Documents', 31784859: 'Gathering Documents (2 Months +)',
  31784864: 'Car Needs More Repairs', 1162206351: 'CNMR/Buyback Coach', 131642113: 'Pending Repair Completion',
  31784862: 'ROs Collected/Missing RISC', 31784860: 'Documents Received', 96740001: 'RO Summary',
  20397847: 'Pending Approval for Filing', 213105036: 'Attorney Review', 250283112: 'BB Coaching - Need RISC',
  197274118: 'Buyback Coaching', 1022096973: 'Prepare Lawsuit w/BB Hold', 1300469856: 'Buyback Offer Review',
  131604394: 'Buyback Coaching - Unresponsive', 235919908: 'Missing Risc - Approved for Filing',
  1143617570: 'Pending Client Consent', 31784863: 'Need to Retain Buyer/Co-Buyer', 131604397: 'Referred Out',
  96740002: 'Drop Case (Non-Responsive)', 96720947: 'Drop Case (Client Relations Drop)',
  1011509781: 'Drop Case (Competitor Firm)', 131534098: 'Drop Case (Client Drop)',
  175430301: 'Drop (CR no Warranty/Repairs)', 175430302: 'Drop (CNMR unwilling to get repairs)',
  175432538: 'Drop (CR - No Evidence)', 154582029: 'Drop - Car Bought Back', 31784861: 'Drop Case (Used Car)',
  1020966176: 'Drop (Intake Review)', 1032794017: 'Drop (Vehicle NIP)', 1058477443: 'Drop - Withdraw as Counsel',
  1360977759: 'Paused',
  // Settlement
  148040364: 'Financials', 148048054: 'Pending Disbursement', 148048052: 'Pending 998', 241154734: 'Update Financials',
  148011374: 'Pending Release', 148011372: 'Pending Surrender', 1212471581: 'Need to Coordinate Surrender',
  1072094529: 'Pending Settlement Funds (BB)', 148011373: 'Pending Settlement Funds (CK)', 148011378: 'Case Settled',
  148011377: 'Fee Motion', 1084046343: 'Closed',
  // Pre-Litigation
  975680106: '(Do not use) Buyback Offer Review', 956264493: 'Pending Manufacturer Offer Letter',
  945088287: 'Offer to Settle Needed', 249514346: 'Drafting Offer to Settle Letter',
  1049715891: 'Offer to Settle Letter Drafted', 249492993: 'Offer to Settle Letter Sent', 249492994: 'Negotiating Offer',
  260423037: 'Offer Letter Settled', 1031908450: 'Pending Review For Demand', 268162879: 'Demand Letter Needed',
  954558009: 'Pre Lit Retainer Needed', 1154653752: 'Retained Client', 1154906116: 'Pending Documents',
  1154906117: 'Documents Received', 1358853379: 'CNMR Review', 1358841212: 'CNMR Needed', 1358853380: 'CNMR Completed',
  1219718316: 'RO Summary for Demand', 249789356: 'Drafting Demand Letter', 249789357: 'Demand Letter Sent',
  961138080: 'Demand Acknowledged by Manu', 954527881: 'Pending Financials', 1053360261: 'Financials Received',
  261377410: 'Negotiating Demand', 249492995: 'Pending Funds West Point', 260419175: 'Pending Pre Lit Surrender',
  261384983: 'Demand Settled', 261377411: 'Demand Letter Denied', 258278825: 'Drop (Client Rejected Offer)',
  965988692: 'Drop (No Offer Presented)', 978646565: 'Drop (Car Bought Back)',
  // Litigation
  250536494: 'Approved for Filing - Need Docs', 249987717: 'Missing RISC - Approved for Filing',
  138640248: 'Used Car - Pending', 135842572: 'Lawsuit Being Prepared', 135842573: 'Lawsuit Filed',
  135842575: 'Process Serving', 135842574: 'Case in Litigation', 1066877503: 'Discovery',
  1066995981: 'Case in Arbitration', 1067020146: 'Going to Trial', 155189871: 'Buyback Pending',
  952781429: 'Drop Case - Used Non-CPO', 155189872: 'Drop Case (Repurchase)',
  170672913: 'Drop Case (Client Requested - In Litigation)', 235928428: 'Missing Retainer/Co-Buyer',
  266764713: 'Dismissed Case', 1067020160: 'Arbitration Closed', 173415517: 'DO NOT USE Approved for Filing',
};

// Closed stages, used for the "Hide deals closed in HubSpot" checkbox.
const closedStages = new Set(['131604397', '1084046343', '148011378', '148011377', '260423037', '261384983', '261377411', '266764713', '1067020160']);

// People who appear as Consent Owner.
const owners = {
  82580539: 'Gail Alexis Lungay', 82580535: 'Andersson Vasquez', 82580642: 'Lenie Rose Agustin',
  82580577: 'Rodrigo Zapata', 82580538: 'Gabriela Garcia', 82580533: 'Arnoldo Thomas', 96605527: 'Jorge Santacruz',
  96605528: 'Junior Lara', 169653256: 'Jeleene Punzal-Payne', 82580645: 'Sam Lloyd Parco Lawan',
  82580644: 'Ma. Rochelle Georgia Nuñez', 82580536: 'Kier Corrales', 82580534: 'Mark Jacob Estilo',
  1649078923: 'Ginalyn Grosz', 82580646: 'Juan Rubio', 426633864: 'Andres Mejia', 593994: 'Jorge Martinez',
  12224786: 'Rachel Espinoza', 1386423656: 'Selene Rosales', 53849270: 'Michael Truscott', 63151993: 'ECS Admins',
  83609449: 'Catherine Sandoval', 84290700: 'Ronald Salguero',
};

// Dropdown values whose label in HubSpot differs from the stored value.
const labels = {
  consent_status: { Retained: 'Consent Received' },
  consent__status: { 'Consent from ALL Parties': 'ALL Parties Consented', 'Only Partial Consent Received': 'In Progress' },
  all_parties_informed: { Yes: 'Call', No: 'SMS' },
};

module.exports = { pipelines, stages, closedStages, owners, labels };
