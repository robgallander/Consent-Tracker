# Consent Tracker

A private website for tracking client consent on lemon-law deals. HubSpot workflows send each deal to the
site whenever it changes; the site keeps a copy in Azure Storage and looks up contacts in Clio. Only people
you invite by email in the Azure portal can open it.

The rules match the Claude dashboard it's modeled on:

- **Pre-filing** and **Filed cases** tabs. A deal is filed once *Date Matter Filed* is set.
- A deal appears when *Consent Owner* is set, and drops off once *Consent Status* is
  "ALL Parties Consented" or "No Consent Needed".
- Deals at Case Settled, Closed, Fee Motion, Demand Settled, Offer Letter Settled, Dismissed Case,
  Arbitration Closed, or any stage with "Drop" in its name are left out.
- **Urgency** is High in the Settlement pipeline or with a trial in the next 90 days; otherwise
  Medium for filed cases and Low for pre-filing.
- Selecting a deal opens its Clio contacts inside the table, under that row.

Rules live in `api/src/lib/config.js`. Stage, pipeline, dropdown and consent-owner names live in
`api/src/lib/names.js` (see "Keeping names up to date").

## How it fits together

```
HubSpot workflows ──POST /api/hubspot/deal──▶  Azure Functions ──▶ Azure Storage table "Deals"
                                                     │
People (signed in, invited) ◀── page in src/ ◀── /api/deals, /api/clio/{matterId}/contacts ──▶ Clio
```

- `src/` is the page (plain HTML, CSS and JavaScript; nothing to build), plus `staticwebapp.config.json`,
  which controls who may open the site.
- `api/` holds the Azure Functions. `npm test` runs the tests.

The HubSpot workflows prove who they are with a shared key sent in the `x-tracker-key` header. People
prove who they are by signing in with Microsoft and having the `tracker` role.

You need **Operations Hub (Data Hub) Professional or Enterprise** in HubSpot for the "Send a webhook"
workflow action.

## Setup

### 1. Make a shared key

This key lets the site know updates really come from your HubSpot. Make a long random one:

- Windows PowerShell: `-join ((48..57)+(97..122) | Get-Random -Count 40 | % {[char]$_})`
- Mac Terminal: `openssl rand -hex 24`

Save it in a private note as **WEBHOOK_KEY**.

### 2. Get the Clio keys

1. In the Clio Developer Portal (developers.clio.com), signed in as a Clio admin, create an application:
   name `Consent Tracker`, redirect URI `https://app.clio.com/oauth/approval`, read access to Contacts and Matters.
2. Save the **Key** as **CLIO_CLIENT_ID** and the **Secret** as **CLIO_CLIENT_SECRET**.
3. Signed in to Clio as someone who can see all matters, open (replace `YOUR_KEY`):
   `https://app.clio.com/oauth/authorize?response_type=code&client_id=YOUR_KEY&redirect_uri=https://app.clio.com/oauth/approval`
   Approve, and copy the code Clio shows.
4. Within 10 minutes, exchange it for a refresh token:
   - Windows PowerShell:
     `Invoke-RestMethod -Method Post -Uri https://app.clio.com/oauth/token -Body @{grant_type="authorization_code"; code="THE_CODE"; client_id="YOUR_KEY"; client_secret="YOUR_SECRET"; redirect_uri="https://app.clio.com/oauth/approval"}`
   - Mac Terminal:
     `curl -X POST https://app.clio.com/oauth/token -d grant_type=authorization_code -d code=THE_CODE -d client_id=YOUR_KEY -d client_secret=YOUR_SECRET -d redirect_uri=https://app.clio.com/oauth/approval`
5. Save `refresh_token` from the response as **CLIO_REFRESH_TOKEN**.

EU, Canada or Australia Clio accounts: use `eu.app.clio.com`, `ca.app.clio.com` or `au.app.clio.com` instead.

### 3. Upload the code to GitHub

Create a **private** repository named `consent-tracker`, choose **uploading an existing file**, and drag in
everything inside this folder (`src`, `api`, `README.md`). `src` and `api` must sit at the top level.

### 4. Create the website in Azure

In the Azure portal: **Create a resource > Static Web App**.

- Resource group: new, `consent-tracker`. Name: `consent-tracker`. Plan: **Free**.
- Source: **GitHub**, your repository, branch `main`.
- Build presets: **Custom**. App location `/src`, Api location `/api`, Output location blank.

Create it and wait 3–5 minutes (watch the repository's **Actions** tab for a green check). Copy the site's
**URL** from its **Overview** page.

### 5. Create the storage for deals

1. **Create a resource > Storage account**. Resource group `consent-tracker`; a lowercase name such as
   `consenttrackerdeals` (it must be unique across Azure); Performance **Standard**; Redundancy **LRS**.
   Create it.
2. In the storage account, open **Security + networking > Access keys**, select **Show** next to key1's
   **Connection string**, and copy it. Save it as **STORAGE_CONNECTION_STRING**.

The site creates its "Deals" table by itself.

### 6. Add the settings to the website

In the Static Web App: **Settings > Environment variables > Production**. Add each, then **Apply**:

| Name | Value |
|---|---|
| `WEBHOOK_KEY` | from step 1 |
| `STORAGE_CONNECTION_STRING` | from step 5 |
| `CLIO_CLIENT_ID` | from step 2 |
| `CLIO_CLIENT_SECRET` | from step 2 |
| `CLIO_REFRESH_TOKEN` | from step 2 |
| `CLIO_BASE_URL` | `https://app.clio.com` |
| `HUBSPOT_PORTAL_ID` | `8854200` |

### 7. Give yourself access

**Settings > Role management > Invite**: provider **Microsoft Entra ID**, your work email, your site's
domain, role `tracker`, 168 hours. **Generate**, open the link, sign in. The site will say no deals have
arrived yet; the next step sends them.

### 8. Build the HubSpot workflows

You'll build two deal-based workflows with the same webhook action. The first sends every existing deal
once; the second sends a deal again whenever one of its tracked fields changes.

**The webhook action (used in both workflows)**

In the workflow, click **+**, then under **Data ops** choose **Send a webhook**:

- Method: **POST**
- Webhook URL: your site's URL followed by `/api/hubspot/deal`, for example
  `https://agreeable-name-123.azurestaticapps.net/api/hubspot/deal`
- Authentication type: **API key**. In the API key menu choose **Add secret**, name it `TRACKER_KEY`, and
  paste your WEBHOOK_KEY as its value. API key name: `x-tracker-key`. API key location: **Request header**.
- Request body: **Include all deal properties**.
- Use **Test action** with any deal that has a Consent Owner. A good result shows status 200 and
  `"ok": true`. Status 400 with "wrong x-tracker-key" means the secret doesn't match WEBHOOK_KEY.

**Workflow 1: "Consent Tracker: send all deals"**

1. **Automation > Workflows > Create workflow > From scratch**, type **Deal-based**.
2. Trigger: **When filter criteria is met**. Filter: **Consent Owner is known**.
3. Leave re-enrollment off.
4. Add the webhook action above.
5. Turn it on. When HubSpot asks about existing deals, choose to **enroll deals that currently meet the
   criteria**. HubSpot then sends all of them; with about 20,000 deals this takes a while, and you can
   watch the count rise on the site.

Leave it on: it also sends a deal the first time someone gives it a Consent Owner.

**Workflow 2: "Consent Tracker: send changes"**

1. Create another **Deal-based** workflow from scratch.
2. Trigger: **When an event occurs > Property value changed**. Add one such trigger for each of these
   properties (they combine with OR), and turn on **re-enrollment** for each:
   Deal Name, Deal Stage, Pipeline, Consent Owner, Status, Consent Status, Retainer Received,
   How Did You Obtain Consent?, RISC/LA Collected, Government ID, Correction RA/DAR Needed,
   Date Matter Filed, Trial Date, Matter ID, Clio Matter.
3. Add the webhook action above.
4. Turn it on. Don't enroll existing deals: workflow 1 already sent them.

### 9. Check it

Open the site. The header shows when the last change arrived from HubSpot. Change a test deal's Consent
Status in HubSpot, wait a minute, and select **Reload**: the change should appear. Select a deal with a Clio
matter to see its Clio contacts.

### 10. Invite your team

Repeat step 7 for each person with the role `tracker`, and send them their link (links last up to 7 days).
To remove someone, tick them in **Role management** and select **Delete**. Azure allows up to 25 invited
people per site.

## Keeping names up to date

HubSpot sends internal values, so `api/src/lib/names.js` lists the names behind them. When you add a
**consent owner, stage, pipeline or dropdown option** in HubSpot, add it there and push to `main`. Until
then the site still works: it shows the raw value (for example "Owner 12345678") instead of the name.

A new stage with "Drop" in its name is left out automatically once its name is in `names.js`; to leave
out any other new stage, add its ID to `excludedStageIds` in `config.js`.

## Good to know

- **Deals deleted or merged in HubSpot** stay in the site's copy, because the workflows can't send a
  deletion. If one lingers, change its Consent Status to "No Consent Needed" before deleting it, or ask for
  a small cleanup feature.
- **HubSpot contacts aren't shown.** A deal workflow can't send the deal's associated contacts, so the panel
  shows Clio contacts and a link to the deal in HubSpot.
- **Re-sending everything:** in workflow 1, re-enroll all deals from the workflow's enrollment options.
  Older updates never overwrite newer ones, so this is always safe.

## Running it on your computer

Install Node.js 20, the Azure Functions Core Tools and the Static Web Apps CLI
(`npm install -g @azure/static-web-apps-cli`), then:

```
cd api
cp local.settings.sample.json local.settings.json   # fill in the Clio keys; storage "memory" is fine locally
npm install
npm test
cd ..
swa start src --api-location api
```

Open `http://localhost:4280`, enter any email at the pretend sign-in page, and add the role `tracker`.
