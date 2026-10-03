# Finance Freedom (free setup: Google Sheet + Netlify + installable app)

Everything below uses free plans (GitHub, Netlify, Google Sheets).

## 1. Put your IPO list in a Google Sheet
1. Open Google Sheets, create a new sheet, then File -> Import -> upload `public/ipo-template.csv` (replace current sheet).
2. Delete the EXAMPLE row and add your IPOs, one per row. Columns:
   name, type (SME or Mainboard), open, close, priceLow, priceHigh, lot, issueSizeCr, gmp, gmpHeard, allotment, listing, registrar, retail, nii, qib, drhpUrl, anchorUrl, allotmentOut
3. Dates: select the date columns, Format -> Number -> Plain text, and type them as yyyy-mm-dd (example 2026-10-05).
4. File -> Share -> Publish to web -> choose your sheet tab and "Comma-separated values (.csv)" -> Publish. Copy the link.
5. Edit the sheet any time. The app picks up changes within about 5 minutes.

## 2. Deploy on Netlify (needs Git or the CLI for the function to run)
- Put this folder in a GitHub repo -> Netlify -> Add new site -> Import from Git. No build command. Publish directory: `public`.
- Site settings -> Environment variables -> add `IPO_SOURCE_URL` = the CSV link from step 1.
- Optional: `IPO_SOURCE_NAME` (label shown in the app), `CACHE_SECONDS` (default 300).

## 3. Install on Android
- Open your Netlify site in Chrome -> menu -> "Install app" / "Add to Home screen". It opens full screen like an app.
- To get an APK file: open pwabuilder.com, paste your Netlify URL, choose "Package for Android", download. An APK can be installed directly; Google Play needs a developer account.


## 4. Supabase: email login, reset email, and live data table (free plan)
1. supabase.com -> New project. Then SQL Editor -> New query -> paste `supabase/schema.sql` -> Run. This creates the `ipos` table (everyone can read, only you can edit) and turns on Realtime.
2. Authentication -> Providers -> Email is on by default. Authentication -> URL Configuration: set **Site URL** to your Netlify URL and add it to Redirect URLs (reset links come back to this address).
3. Project Settings -> API: copy **Project URL** and the **anon public** key into `public/config.js` (supabaseUrl, supabaseKey). Never use the service_role key there. Commit and redeploy.
4. Enter IPO data: Table Editor -> ipos -> Insert row (works on a phone browser too). The app shows changes within seconds while it is open (Realtime) and also refreshes every 5 minutes.
5. Users register with email + password. If "Confirm email" is on (default), they get a confirmation mail first; for quick testing you can turn it off in Authentication -> Providers -> Email. "Forgot password?" sends a reset link; the link opens the app on a "Set a password" screen.
6. Supabase's built-in email sender is rate limited (a few mails per hour, as far as I know). For real users add your own SMTP in Authentication -> SMTP Settings.
If config.js is empty the app still runs: email + password stay on the device (no reset email) and live data comes from /api/ipos (Google Sheet or JSON, sections 1-2).

## 4b. Optional: auto-copy your Google Sheet into Supabase
Edit the Sheet as before, and let Supabase copy it into the table every 5 minutes.
1. Install the Supabase CLI, then: `supabase link --project-ref YOUR_REF`, `supabase secrets set IPO_SOURCE_URL="<published CSV link>"`, `supabase functions deploy sync-ipos`.
2. Schedule it (SQL Editor; enable the pg_cron and pg_net extensions first, replace YOUR_REF and YOUR_ANON_KEY):
   select cron.schedule('sync-ipos','*/5 * * * *', $$ select net.http_post(url:='https://YOUR_REF.supabase.co/functions/v1/sync-ipos', headers:='{"Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb) $$);
This function is untested against a real project, so run it once by hand first and check the ipos table.

## 4c. Sync accounts and bids between phones
`supabase/schema.sql` also creates the `user_data` table (one row per user, each user can only read and write their own row). If you ran the schema before, run the new part at the bottom of the file again (it is safe to re-run).
- When a user logs in on any phone, the app merges that phone's accounts and bids with the saved copy and uploads the result. Changes on one phone show up on the other within seconds while the app is open (Realtime).
- The newer change wins per account or bid. Deleted accounts stay deleted on all phones.
- Needs a Supabase login (config.js filled). Without Supabase, data stays on each phone.
- Privacy: the synced data includes account names, UPI IDs, PAN and Demat numbers. Row level security keeps each user's row private, but the data sits in your Supabase project in readable form for you as the project owner. If you do not want that, ask for PAN and Demat to be left out of sync or encrypted on the phone before upload.
- Demo parts (scheduled bid results, allotment status) are still simulated, so two phones can show slightly different demo outcomes until they sync.

## 5. Notifications from live data
The app compares each refresh (every 5 minutes while the app is open, and on pull-to-refresh) with the previous one and notifies you about:
- Live subscription: Retail, NII or QIB crossing 1x, 2x, 5x, 10x, 20x, 50x, 100x
- GMP change: at least 2% of the upper price band (minimum Rs 1)
- DRHP/RHP: `drhpUrl` column gets filled
- Anchor list: `anchorUrl` column gets filled
- Allotment out: `allotmentOut` column set to yes (if empty, the allotment date is used)
Each one has its own switch in Settings -> Notification settings, shows in the bell list, and pops up on the phone when "Allow device alerts" is on.
The DRHP/RHP and ANCHOR buttons in an IPO's View screen open those links.
Limit: alerts arrive while the app is open or in the background. Alerts when the app is fully closed need push messaging (Firebase Cloud Messaging plus a server job), which is not included yet.

## How it behaves
- The app calls /api/ipos on open, every 5 minutes and on pull-to-refresh. If the sheet cannot be read it keeps the built-in sample data.
- Fields left empty show as "-". GMP, subscription and all numbers are only as good as what you type in the sheet.
- JSON feeds also work: set IPO_SOURCE_URL to any JSON URL in the shape below. You can also fill data/ipos.json by hand.
  { "source": "name", "updatedAt": "ISO time", "ipos": [ { "name": "...", "type": "SME|Mainboard", "open": "yyyy-mm-dd", "close": "...", "priceLow": 0, "priceHigh": 0, "lot": 0, "issueSizeCr": 0, "gmp": 0, "gmpHeard": "", "allotment": "", "listing": "", "registrar": "", "subscription": { "retail": 0, "nii": 0, "qib": 0 } } ] }

## Still local to each phone
Accounts and bids are stored in the browser of each phone (not synced between phones). Login works with Supabase when configured.
