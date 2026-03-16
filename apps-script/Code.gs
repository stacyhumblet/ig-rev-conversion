// ============================================================
//  Revenue & Conversion Dashboard (Instagram)
//  Google Apps Script — Code.gs
//  Northwind Consulting — Creator & Ecommerce
// ============================================================

const DATA_SHEET_ID = '1c86yKsvHafajJSLYiHDrFQ6Evgx9rxGJTalRSEI46l0';
const TRAFFIC_TAB   = 'db_traffic';
const CACHE_KEY     = 'ig_commerce_v1';
const CACHE_TTL     = 1200;  // 20 min — trigger every 10 min keeps it always warm
const PLATFORM      = 'instagram';


// ── Entry point ────────────────────────────────────────────────────────────────
function doGet() {
  try {
    return ContentService
      .createTextOutput(JSON.stringify(getIgCommerceData()))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ── Called from client via google.script.run ──────────────────────────────────
function getIgCommerceData() {
  const cache  = CacheService.getScriptCache();
  const cached = _getChunks(cache);
  if (cached) return JSON.parse(cached);

  const ss    = SpreadsheetApp.openById(DATA_SHEET_ID);
  const sheet = ss.getSheetByName(TRAFFIC_TAB);
  if (!sheet) throw new Error('Tab not found: ' + TRAFFIC_TAB);

  const vals    = sheet.getDataRange().getValues();
  const headers = vals[0].map(String);

  function col(name) { return headers.indexOf(name); }

  const iPlatform   = col('platform');
  const iUtmSource  = col('utm_source');
  const iDate       = col('session_date');
  const iCampaign   = col('utm_campaign');
  const iContent    = col('utm_content');
  const iContentId  = col('content_id');
  const iSessions   = col('sessions');
  const iOrders     = col('orders');
  const iRevenue    = col('revenue');
  const iConvRate   = col('conversion_rate');
  const iAov        = col('avg_order_value');
  const iBounces    = col('bounces');
  const iBounceRate = col('bounce_rate');

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                       'Jul','Aug','Sep','Oct','Nov','Dec'];

  const rows     = [];
  const years    = new Set();
  const months   = new Set();
  const campaigns= new Set();
  const contents = new Set();

  for (let i = 1; i < vals.length; i++) {
    const row = vals[i];
    if (!row[col('session_id')]) continue;

    // Filter to Instagram only
    const platform  = String(row[iPlatform]  || '').trim().toLowerCase();
    const utmSource = String(row[iUtmSource] || '').trim().toLowerCase();
    if (platform !== PLATFORM && utmSource !== PLATFORM) continue;

    const rawDate = row[iDate];
    const d       = rawDate ? new Date(rawDate) : null;
    const yr      = d ? String(d.getFullYear())                  : '';
    const mo      = d ? String(d.getMonth() + 1).padStart(2,'0'): '';
    const mKey    = yr && mo ? `${yr}-${mo}` : '';
    const mLabel  = d ? `${MONTH_NAMES[d.getMonth()]} ${yr}`    : '';

    const campaign  = String(row[iCampaign]  || '').trim() || '(none)';
    const content   = String(row[iContent]   || '').trim() || '(none)';
    const contentId = String(row[iContentId] || '').trim() || '';

    const sessions   = parseFloat(row[iSessions])   || 0;
    const orders     = parseFloat(row[iOrders])     || 0;
    const revenue    = parseFloat(row[iRevenue])    || 0;
    const bounces    = parseFloat(row[iBounces])    || 0;

    rows.push({ yr, mo, mKey, mLabel, campaign, content, contentId,
                sessions, orders, revenue, bounces });

    if (yr) years.add(yr);
    if (mo) months.add(mo);
    if (campaign !== '(none)') campaigns.add(campaign);
    if (content  !== '(none)') contents.add(content);
  }

  const MONTH_ORDER = ['01','02','03','04','05','06','07','08','09','10','11','12'];

  const result = {
    rows,
    fo: {
      years:     [...years].sort().reverse(),
      months:    MONTH_ORDER.filter(m => months.has(m))
                   .map(m => ({ value: m, label: MONTH_NAMES[parseInt(m) - 1] })),
      campaigns: [...campaigns].sort(),
      contents:  [...contents].sort(),
    },
  };

  _putChunks(cache, JSON.stringify(result));
  return result;
}


// ── Cache helpers ──────────────────────────────────────────────────────────────
function _putChunks(cache, json) {
  try {
    const CHUNK = 90000;
    const total = Math.ceil(json.length / CHUNK);
    const pairs = { '__ig_chunks__': String(total) };
    for (let i = 0; i < total; i++) {
      pairs[CACHE_KEY + '_' + i] = json.slice(i * CHUNK, (i + 1) * CHUNK);
    }
    cache.putAll(pairs, CACHE_TTL);
  } catch (e) { console.log('Cache write failed:', e); }
}

function _getChunks(cache) {
  try {
    const meta = cache.get('__ig_chunks__');
    if (!meta) return null;
    const total  = parseInt(meta);
    const keys   = Array.from({ length: total }, (_, i) => CACHE_KEY + '_' + i);
    const stored = cache.getAll(keys);
    if (Object.keys(stored).length !== total) return null;
    return keys.map(k => stored[k]).join('');
  } catch (e) { return null; }
}


// ── Utilities ──────────────────────────────────────────────────────────────────
function clearCache() {
  CacheService.getScriptCache().remove('__ig_chunks__');
  Logger.log('Cache cleared.');
}

function warmCache() {
  clearCache();
  getIgCommerceData();
  Logger.log('Cache warmed at ' + new Date().toLocaleString());
}

function createWarmCacheTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'warmCache')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('warmCache').timeBased().everyMinutes(10).create();
  Logger.log('Trigger created — fires every 10 min, cache TTL 20 min.');
}

function testDataAccess() {
  clearCache();
  const data = getIgCommerceData();
  Logger.log('Instagram rows: ' + data.rows.length);
  Logger.log('Filter options: ' + JSON.stringify(data.fo));
}
