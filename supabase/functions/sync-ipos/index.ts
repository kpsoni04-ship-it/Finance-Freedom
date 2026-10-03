// Optional: copies a Google Sheet (published as CSV) into the ipos table.
// Deploy: supabase functions deploy sync-ipos ; set secret IPO_SOURCE_URL to the CSV link.
// Schedule it (every 5 min) with the SQL in README section 3.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function csvRows(t: string) {
  const rows: string[][] = []; let r: string[] = [], c = '', q = false;
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
const num = (v: string) => (v === undefined || v === '' || isNaN(+v) ? null : +v);
const day = (v: string) => {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(v); return isNaN(+d) ? null : d.toISOString().slice(0, 10);
};

Deno.serve(async () => {
  const url = Deno.env.get('IPO_SOURCE_URL');
  if (!url) return new Response('IPO_SOURCE_URL is not set', { status: 400 });
  const txt = await (await fetch(url)).text();
  const [h, ...rs] = csvRows(txt.trim());
  const keys = h.map((x) => x.trim());
  const rows = rs.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] || '').trim()])))
    .filter((o) => o.name)
    .map((o) => ({
      name: o.name, type: /sme/i.test(o.type || '') ? 'SME' : 'Mainboard',
      open_date: day(o.open), close_date: day(o.close),
      price_low: num(o.priceLow), price_high: num(o.priceHigh), lot: num(o.lot), issue_size_cr: num(o.issueSizeCr),
      gmp: num(o.gmp) ?? 0, gmp_heard: o.gmpHeard || null,
      allotment_date: day(o.allotment), listing_date: day(o.listing), registrar: o.registrar || null,
      sub_retail: num(o.retail) ?? 0, sub_nii: num(o.nii) ?? 0, sub_qib: num(o.qib) ?? 0,
      drhp_url: o.drhpUrl || null, anchor_url: o.anchorUrl || null,
      allotment_out: o.allotmentOut ? /^(y|yes|true|1)$/i.test(o.allotmentOut) : null,
    }));
  if (!rows.length) return new Response('No rows found in source', { status: 422 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await sb.from('ipos').upsert(rows, { onConflict: 'name' });
  if (error) return new Response(error.message, { status: 500 });
  return new Response(`synced ${rows.length} rows`);
});
