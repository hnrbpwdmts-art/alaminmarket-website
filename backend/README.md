# Order log (Google Sheet) and order emails

Every order a customer sends from the website is also saved to a Google Sheet,
with three tabs that fill in automatically:

- **Orders**: one row per order (who, when, pickup day and time, total, opt-in)
- **Items**: one row per item ordered (best for seeing what sells)
- **Customers**: one row per phone number (first and last order, number of orders, text opt-in)

## One-time setup (about 10 minutes)

1. Go to sheets.google.com, signed in to the store's Google account, and create a
   blank sheet. Name it "Al-Amin Orders".
2. In the sheet, click **Extensions > Apps Script**.
3. Delete everything in the editor, then paste in all of `backend/Code.gs`. Click the
   save icon.
4. Click **Deploy > New deployment**. Click the gear next to "Select type" and choose
   **Web app**.
   - Description: Order log
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy**. Google asks you to allow access to your sheets: click
   **Authorize access**, choose the store account, then **Advanced > Go to project (unsafe)
   > Allow**. (It says "unsafe" because you wrote the script yourself and Google hasn't
   reviewed it.)
6. Copy the **Web app URL** (it ends in `/exec`).
7. Paste it into `orderLogUrl` in `meat-menu.js`, or send it to Claude.

Open the URL in a browser to check it: it should say "Super Al-Amin order log is running."

## Order emails (orders from the "Submit order" button)

Orders placed with the website's **Submit order** button are saved to the sheet and
emailed to `NOTIFY_EMAIL` at the top of `Code.gs` (Muhammad@alaminmarket.com).
WhatsApp and text orders aren't emailed, because they already arrive on the store phone.

**To switch emails on, or after any change to Code.gs:**
1. Open the sheet, then **Extensions > Apps Script**.
2. Replace everything with the new `Code.gs` and save.
3. **Deploy > Manage deployments**, click the pencil (Edit), set **Version** to
   **New version**, then **Deploy**. The link stays the same.
4. Google asks to allow the script to **send email as you**: click **Authorize access**
   and allow it.
5. Place a test order on the website with **Submit order** and check the email arrives.

Google allows about 100 of these emails a day on a free account.

**Order changes:** customers see a "Check your order" screen before sending. If they
change an order after sending it (within 12 hours), it's sent again with the same
order number, the email subject starts with "UPDATED", and the sheet's Channel column
says "Website (UPDATE)". Use the newest version.

## Everyday use

- Open the sheet on your phone with the Google Sheets app. New orders appear within
  seconds of being sent.
- **Text opt-ins:** the Customers tab shows who agreed to receive deals by text.
  When someone replies STOP, change their "Texts opt-in" to **No** and don't text them again.
- **Deleting a customer's information** (if they ask): delete their rows in all three tabs.
- **Keeping records for up to two years** (as the privacy notice says): once a year,
  delete rows older than two years.

## Notes

- Anyone with the web app link could send fake rows to the sheet. If that ever happens,
  repeat steps 4 to 7 to make a new link and paste the new one in.
- If you change `Code.gs` later, use **Deploy > Manage deployments > Edit > New version**
  so the link stays the same.

## Staff order page (alaminmarket.com/admin/)

An extra, private page that lists recent orders from this sheet, lets staff mark
each one Confirmed / Ready / Out for delivery / Done / Cancelled, and opens
WhatsApp or Messages on the phone with a ready-to-send note for the customer.
Order emails, WhatsApp, and text orders keep working exactly as before.

1. In `Code.gs`, set `ADMIN_PASSCODE` to your own passcode (8+ characters).
2. Paste the whole file into Extensions > Apps Script and click Save.
3. Deploy > Manage deployments > pencil (Edit) > Version: **New version** > Deploy.
   The link stays the same.
4. Open alaminmarket.com/admin/ and sign in with the passcode.

The page adds three columns to the Orders tab: Status, Final total, Status updated.
After 10 wrong passcodes the page locks for 15 minutes. To sign everyone out,
change the passcode and redeploy.

## Phone call reminders for new orders (Twilio)

When a website order comes in, the store landline rings and reads the order
out: "New online order from Sara, for pickup today, 12 to 3 PM. Press 1 to
confirm." If nobody presses 1, it calls again every 5 minutes: 5 tries on the
landline, then 3 on the backup cell (424) 527-3540. Calls happen only while
the store is open; a late-night order rings at 10 AM. Marking the order on the
staff page also stops the calls. Emails, WhatsApp and texts are unchanged.

1. Twilio (twilio.com): create an account, upgrade it (add a payment method;
   trial accounts play an extra message and can't be used here), and buy a
   local phone number with Voice.
2. Cloudflare > Workers & Pages > alaminmarket-website > Settings > Variables
   and Secrets. Add these as **Secrets** (Production and Preview):
   - `TWILIO_ACCOUNT_SID`  (starts with AC, on the Twilio console home page)
   - `TWILIO_AUTH_TOKEN`   (same page, click to show)
   - `TWILIO_FROM`         your Twilio number, like +13105550123
   - `CALL_SECRET`         any long random text, like a 30-letter password
   Then Deployments > latest > Retry deployment.
3. In `Code.gs`, set `CALL_SECRET` to the exact same text. Save.
4. In the Apps Script editor, pick `setupCallReminders` in the function menu,
   click Run, and approve the permissions. (Once only.)
5. Deploy > Manage deployments > Edit > New version > Deploy.
6. Optional test: pick `testCall` and click Run. The landline should ring.

Save the Twilio number in the store phones as "Online Order".
The Orders tab gains three columns: Call status, Call tries, Last call.
To turn calls off, set `CALL_SECRET = ""` in Code.gs and redeploy.
