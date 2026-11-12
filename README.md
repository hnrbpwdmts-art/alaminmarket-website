# Super Al-Amin Halal Market — website

Plain HTML/CSS/JavaScript. No build step, no installs.

## Preview
- Quickest: double-click `index.html` to open it in your browser.
- Or, from this folder, run `python3 -m http.server 8080` and visit http://localhost:8080
  (to test on your phone, use http://YOUR-COMPUTER-IP:8080 on the same Wi-Fi).

## What to edit
**`site-config.js`** is the only file you need for everyday changes:
- Store details: address, phone, WhatsApp number, directions link, store hours (empty until you add them)
- Prefilled WhatsApp messages
- Photos: drop your image into `images/`, then change the `src` and `alt` lines
- Grocery categories
- Announcement banner: set `show: true` and change `text`

Page title and search description are in the `<head>` of `index.html`.
Colors are at the top of `styles.css`.

## Hosting
Upload the whole folder to any static host (Netlify, Cloudflare Pages, GitHub Pages, or your web host).

## Google reviews (optional, live)
The Reviews section is turned off. To turn it on, set `show: true` under `reviews` in `site-config.js`.
Without further setup, the Reviews section shows a "Read reviews on Google" button.
To show live reviews on the page:
1. Go to console.cloud.google.com, create a project, and add a billing account.
2. In "APIs & Services", enable **Maps JavaScript API** and **Places API (New)**.
3. In "Credentials", create an **API key**. Restrict it:
   - Application restriction: Websites -> add `https://yourdomain.com/*` and `https://www.yourdomain.com/*`
   - API restriction: only the two APIs above
4. Find your store's Place ID with Google's "Place ID Finder" (search the store name; it looks like `ChIJ...`).
5. Paste both into `reviews` in `site-config.js`. Adding the Place ID alone also turns on a "Write a review" button.

Cost: each visit that scrolls to Reviews is one "Place Details Enterprise + Atmosphere" request.
Google gives 1,000 free per month; after that it is about $25 per 1,000. Set a budget alert in Google Cloud Billing.
Google requires sites using its Maps APIs to mention this in a privacy policy.

## Posting deals from a Google Sheet (no code)
One-time setup:
1. Go to sheets.google.com and create a sheet (or import deals-template.csv from this folder).
2. Row 1 must have these headings: Show | Title | Details | Label | Ends
3. File > Share > Publish to web > choose the sheet > "Comma-separated values (.csv)" > Publish. Copy the link.
4. Paste the link into dealsSheetUrl in site-config.js and re-upload the folder to Netlify (Deploys).

Everyday use (works from your phone in the Google Sheets app):
- Add a row: Show = Yes, a Title, short Details, an optional Label ("New arrival", "Deal"), and an optional Ends date.
- To take a deal down, change Show to No, or let the Ends date pass.
- Changes appear on the website within about 5 minutes. No re-uploading needed.

## WhatsApp sign-up list
- One time: in Netlify, open the project > Forms > Enable form detection, then re-upload the folder (Deploys).
- Sign-ups appear in Netlify > Forms > whatsapp-signup. Download them as CSV anytime.
- To get an email for each sign-up: Forms > Form notifications > Add notification > Email.
- Only message people who signed up, and stop messaging anyone who asks.

## Photos and videos
- Gallery photos ("From our shelves") are listed under `showcases` in site-config.js.
- Square photos about 600x600 work best for galleries; keep each photo under ~150 KB.
- Videos: short, muted clips (under ~15 seconds, under ~1 MB) in the `videos` folder.
