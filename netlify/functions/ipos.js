// GET /api/ipos  ->  { source, updatedAt, ipos: [...] }
// Data comes from IPO_SOURCE_URL (your authorized IPO data API / JSON feed).
// If it is not set or fails, data/ipos.json is used (edit it by hand if you like).
const fs = require('fs'), path = require('path');
let cache = { t: 0, body: null };

const pick = (o, ...k) => { for (const x of k) if (o[x] !== undefined && o[x] !== null && o[x] !== '') return o[x]; };
const iso = d => {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return String(d).slice(0, 10);
  const t = new Date(d); if (isNaN(t)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
};
// Adapt field names of YOUR provider here if they differ.
const item = o => {
  const s = pick(o, 'subscription', 'subs') || { retail: o.retail, nii: o.nii, qib: o.qib };
  return {
    name: pick(o, 'name', 'company', 'companyName'),
    type: /sme/i.test(pick(o, 'type', 'category', 'board') || '') ? 'SME' : 'Mainboard',
    open: iso(pick(o, 'open', 'openDate')), close: iso(pick(o, 'close', 'closeDate')),
    priceLow: pick(o, 'priceLow', 'minPrice', 'lowPrice'), priceHigh: pick(o, 'priceHigh', 'maxPrice', 'highPrice'),
    lot: pick(o, 'lot', 'lotSize'), issueSizeCr: pick(o, 'issueSizeCr', 'issueSize'),
    gmp: pick(o, 'gmp', 'premium'), gmpHeard: pick(o, 'gmpHeard', 'lastHeard'),
    allotment: iso(pick(o, 'allotment', 'allotmentDate')), listing: iso(pick(o, 'listing', 'listingDate')),
    registrar: pick(o, 'registrar'), financials: pick(o, 'financials'),
    drhpUrl: pick(o, 'drhpUrl', 'rhpUrl', 'drhp'), anchorUrl: pick(o, 'anchorUrl', 'anchor'), allotmentOut: pick(o, 'allotmentOut'),
    subscription: { retail: pick(s, 'retail', 'rii'), nii: pick(s, 'nii', 'hni'), qib: pick(s, 'qib') }
  };
};
// CSV support (for a Google Sheet published to the web as CSV)
function csvRows(t) {
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { r.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); rows.push(r); r = []; c = ''; }
    else c += ch;
  }
  if (c !== '' || r.length) { r.push(c); rows.push(r); }
  return rows;
}
const csvToObj = t => {
  const [h, ...rs] = csvRows(t.trim()); const k = h.map(x => x.trim());
  return rs.filter(r => r.some(x => x.trim())).map(r => Object.fromEntries(k.map((x, i) => [x, (r[i] || '').trim()])));
};
const normalize = j => {
  const a = Array.isArray(j) ? j : (j.ipos || j.data || []);
  return { source: j.source || process.env.IPO_SOURCE_NAME || 'server', updatedAt: j.updatedAt || new Date().toISOString(), ipos: a.map(item).filter(x => x.name) };
};
const reply = b => ({ statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }, body: JSON.stringify(b) });

exports.handler = async () => {
  const ttl = (+process.env.CACHE_SECONDS || 300) * 1000;
  if (cache.body && Date.now() - cache.t < ttl) return reply(cache.body);
  let body;
  try {
    if (process.env.IPO_SOURCE_URL) {
      const r = await fetch(process.env.IPO_SOURCE_URL, { headers: process.env.IPO_API_KEY ? { Authorization: 'Bearer ' + process.env.IPO_API_KEY } : {} });
      if (!r.ok) throw new Error('source status ' + r.status);
      const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch (e) { j = csvToObj(txt); }
      body = normalize(j);
    }
  } catch (e) { console.error('IPO source failed:', e.message); }
  if (!body || !body.ipos.length) {
    try { body = normalize(JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/ipos.json'), 'utf8'))); }
    catch (e) { body = { source: 'none', updatedAt: new Date().toISOString(), ipos: [] }; }
  }
  cache = { t: Date.now(), body };
  return reply(body);
};
