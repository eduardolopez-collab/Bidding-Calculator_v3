/**
 * Azure Function — Excel Sync v2
 * Trigger: Timer — runs nightly at 2:00 AM UTC
 *
 * Reads the FSR Pricing Tool Excel workbook from SharePoint via Microsoft Graph,
 * parses City Index and Bidding Matrix sheets, upserts into Azure SQL.
 *
 * Deploy as an Azure Function App (Node.js 20+, Consumption plan).
 *
 * Required App Settings (stored in Azure Key Vault):
 *   SHAREPOINT_SITE_URL    e.g. https://flixbus.sharepoint.com/sites/Facilities
 *   SHAREPOINT_FILE_ID     Drive item ID of the pricing Excel workbook
 *                          (preferred — more reliable than path-based lookup)
 *   SHAREPOINT_FILE_PATH   Fallback: /Shared Documents/Pricing Tool/FSR_Pricing.xlsx
 *   AZURE_TENANT_ID
 *   AZURE_CLIENT_ID
 *   AZURE_CLIENT_SECRET    (Key Vault reference)
 *   DB_SERVER / DB_NAME / DB_USER / DB_PASSWORD
 */

'use strict';

const { app }       = require('@azure/functions');
const { Client }    = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
const XLSX          = require('xlsx');
const sql           = require('mssql');

const dbConfig = {
  server:   process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options:  { encrypt: true }
};

// ── Timer trigger: nightly at 2:00 AM UTC ────────────────────────────────────
app.timer('excelSync', {
  schedule: '0 0 2 * * *',
  handler:  async (myTimer, context) => {
    context.log('Excel sync started:', new Date().toISOString());
    try {
      const buffer           = await downloadExcel(context);
      const { cities, services } = parseExcel(buffer, context);
      await upsertToDatabase(cities, services, context);
      context.log(`Sync complete — Cities: ${cities.length}, Services: ${services.length}`);
    } catch (err) {
      context.log.error('Excel sync FAILED:', err.message);
      throw err; // rethrow so Azure marks the invocation as failed
    }
  }
});

// ── Download Excel from SharePoint via Microsoft Graph ────────────────────────
async function downloadExcel(context) {
  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID,
    process.env.AZURE_CLIENT_ID,
    process.env.AZURE_CLIENT_SECRET
  );
  const token = await credential.getToken('https://graph.microsoft.com/.default');
  const client = Client.init({ authProvider: done => done(null, token.token) });

  let driveItemId = process.env.SHAREPOINT_FILE_ID;

  if (!driveItemId) {
    // Fallback: resolve by path
    const siteUrl    = process.env.SHAREPOINT_SITE_URL;
    const filePath   = process.env.SHAREPOINT_FILE_PATH;
    const sites      = await client.api(`/sites?search=${encodeURIComponent(siteUrl)}`).get();
    const siteId     = sites.value[0].id;
    const driveItem  = await client.api(`/sites/${siteId}/drive/root:${filePath}`).get();
    driveItemId      = driveItem.id;
    context.log('Resolved file by path. Consider setting SHAREPOINT_FILE_ID for reliability.');
  }

  const siteUrl     = process.env.SHAREPOINT_SITE_URL;
  const sites       = await client.api(`/sites?search=${encodeURIComponent(siteUrl)}`).get();
  const siteId      = sites.value[0].id;
  const contentStream = await client.api(`/sites/${siteId}/drive/items/${driveItemId}/content`).getStream();

  const chunks = [];
  for await (const chunk of contentStream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  context.log(`Downloaded Excel — ${(buffer.length / 1024).toFixed(0)} KB`);
  return buffer;
}

// ── Parse Excel — City Index + Bidding Matrix tabs ────────────────────────────
function parseExcel(buffer, context) {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // ── City Index ──────────────────────────────────────────────────────────
  const citySheet = wb.Sheets['City Index']
    || wb.Sheets[wb.SheetNames.find(n => n.toLowerCase().includes('city'))]
    || wb.Sheets[wb.SheetNames[0]];

  const cityRows = XLSX.utils.sheet_to_json(citySheet, { header: 1, defval: '' });

  // Find the header row (contains 'FAC' in col A, or 'City' in col B)
  const hdrIdx = cityRows.findIndex(r =>
    String(r[0]).startsWith('FAC') || String(r[1]).toLowerCase() === 'city'
  );

  const cities = [];
  for (let i = hdrIdx + 1; i < cityRows.length; i++) {
    // Expected columns: [facility_id, city, state, tier, multiplier, ?, notes]
    const [rawId, rawCity, rawState, rawTier, rawMult, , rawNotes] = cityRows[i];
    const id = String(rawId || '').trim();
    if (!id.startsWith('FAC')) continue;

    const multiplier = parseFloat(String(rawMult).replace(/[^0-9.]/g, ''));
    if (isNaN(multiplier)) continue;

    cities.push({
      id,
      city:  String(rawCity  || '').trim(),
      state: String(rawState || '').trim().toUpperCase().slice(0, 2),
      tier:  String(rawTier  || '').trim(),   // 'Low Cost' | 'Mid Cost' | 'High Cost'
      multiplier,
      notes: String(rawNotes || '').trim()
    });
  }

  // ── Bidding Matrix ──────────────────────────────────────────────────────
  const svcSheet = wb.Sheets['Bidding Matrix']
    || wb.Sheets[wb.SheetNames.find(n => n.toLowerCase().includes('bidding') || n.toLowerCase().includes('matrix'))]
    || wb.Sheets[wb.SheetNames[1]];

  const svcRows = XLSX.utils.sheet_to_json(svcSheet, { header: 1, defval: '' });

  const svcHdrIdx = svcRows.findIndex(r =>
    String(r[0]).startsWith('SVC') || String(r[1]).toLowerCase().includes('category')
  );

  // Units that imply measurement-based (unit_based flag)
  const unitBasedUnits = new Set([
    'per sq ft','per linear ft','per acre','per cu yd',
    'per ton','per sheet','per stall','per pane','per room','per zone'
  ]);

  const services = [];
  for (let i = svcHdrIdx + 1; i < svcRows.length; i++) {
    // Expected columns: [svc_id, category, subtype, unit, low, med, high, ?, notes, travel]
    const [rawId, rawCat, rawSub, rawUnit, rawLow, rawMed, rawHigh, , rawNotes, rawTravel] = svcRows[i];
    const id = String(rawId || '').trim();
    if (!id.startsWith('SVC')) continue;

    const clean = v => parseFloat(String(v || 0).replace(/[$,\s]/g, '')) || 0;
    const pLow  = clean(rawLow);
    const pMed  = clean(rawMed);
    const pHigh = clean(rawHigh);
    const tCost = clean(rawTravel);

    if (isNaN(pLow) || pMed === 0) continue;

    const unitStr = String(rawUnit || '').toLowerCase().trim();
    const catStr  = String(rawCat  || '').toLowerCase();

    const special = catStr.includes('camera') ? 'Cameras'
                  : catStr.includes('signage') ? 'Signage'
                  : catStr.includes('pest')    ? 'Pest'
                  : null;

    services.push({
      id,
      cat:     String(rawCat  || '').trim(),
      sub:     String(rawSub  || '').trim(),
      unit:    String(rawUnit || '').trim(),
      pLow, pMed, pHigh, tCost,
      isUnit:  unitBasedUnits.has(unitStr),
      special,
      notes:   String(rawNotes || '').trim()
    });
  }

  context.log(`Parsed — Cities: ${cities.length}, Services: ${services.length}`);
  return { cities, services };
}

// ── Upsert to Azure SQL ───────────────────────────────────────────────────────
async function upsertToDatabase(cities, services, context) {
  const pool = await sql.connect(dbConfig);
  const now  = new Date();
  let cityCount = 0, svcCount = 0;

  for (const c of cities) {
    await pool.request()
      .input('id',    sql.NVarChar(10),  c.id)
      .input('city',  sql.NVarChar(100), c.city)
      .input('state', sql.NChar(2),      c.state)
      .input('tier',  sql.NVarChar(20),  c.tier)
      .input('mult',  sql.Decimal(4,2),  c.multiplier)
      .input('notes', sql.NVarChar(500), c.notes)
      .input('ts',    sql.DateTime2,     now)
      .query(`
        MERGE cities AS target
        USING (SELECT @id AS facility_id) AS source ON target.facility_id = source.facility_id
        WHEN MATCHED THEN
          UPDATE SET city=@city, state=@state, tier=@tier, cost_multiplier=@mult,
                     notes=@notes, last_synced=@ts
        WHEN NOT MATCHED THEN
          INSERT (facility_id, city, state, tier, cost_multiplier, notes, last_synced)
          VALUES (@id, @city, @state, @tier, @mult, @notes, @ts);
      `);
    cityCount++;
  }

  for (const s of services) {
    await pool.request()
      .input('id',       sql.NVarChar(10),        s.id)
      .input('cat',      sql.NVarChar(100),        s.cat)
      .input('sub',      sql.NVarChar(200),        s.sub)
      .input('unit',     sql.NVarChar(50),         s.unit)
      .input('pLow',     sql.Decimal(10,2),        s.pLow)
      .input('pMed',     sql.Decimal(10,2),        s.pMed)
      .input('pHigh',    sql.Decimal(10,2),        s.pHigh)
      .input('travel',   sql.Decimal(10,2),        s.tCost)
      .input('unitBase', sql.Bit,                  s.isUnit ? 1 : 0)
      .input('special',  sql.NVarChar(50),         s.special || null)
      .input('notes',    sql.NVarChar(500),        s.notes)
      .input('ts',       sql.DateTime2,            now)
      .query(`
        MERGE services AS target
        USING (SELECT @id AS service_id) AS source ON target.service_id = source.service_id
        WHEN MATCHED THEN
          UPDATE SET category=@cat, subtype=@sub, unit=@unit,
                     price_low=@pLow, price_medium=@pMed, price_high=@pHigh,
                     travel_cost=@travel, unit_based=@unitBase,
                     special_flag=@special, scope_notes=@notes, last_synced=@ts
        WHEN NOT MATCHED THEN
          INSERT (service_id, category, subtype, unit, price_low, price_medium,
                  price_high, travel_cost, unit_based, special_flag, scope_notes, last_synced)
          VALUES (@id, @cat, @sub, @unit, @pLow, @pMed, @pHigh, @travel,
                  @unitBase, @special, @notes, @ts);
      `);
    svcCount++;
  }

  await pool.close();
  context.log(`Upsert complete — ${cityCount} cities, ${svcCount} services.`);
}
