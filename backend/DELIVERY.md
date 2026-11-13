# Delivery prices (Uber Direct)

The order page asks Uber for a live delivery price when a customer enters their address.
The code is ready; it switches on once the site runs on Cloudflare Pages and the Uber keys are added.

## Setup

1. Get approved for Uber Direct (merchants.ubereats.com > Uber Direct).
2. In the Uber Direct dashboard, open **Developer** and copy the **Customer ID**, **Client ID**, and **Client secret**.
   Use the test keys first, then the live keys.
3. In Cloudflare: **Workers & Pages > alaminmarket > Settings > Variables and Secrets**, add:
   - `UBER_CUSTOMER_ID`
   - `UBER_CLIENT_ID`
   - `UBER_CLIENT_SECRET` (choose "Secret")
   - `STORE_PHONE` = `+13105381188` (optional)
   - `DELIVERY_ZIPS` = ZIP codes you deliver to, separated by spaces, e.g. `90504 90501 90503` (optional; leave it out to allow anywhere Uber delivers)
4. In `meat-menu.js`, set `delivery.enabled: true`.

## Everyday use

- The order message shows the Uber delivery fee and a quote ID like `[dqt_...]`.
- When the order is cut and packed, book the driver in the Uber Direct dashboard.
- Quotes expire after about 15 minutes, so the fee when you book may differ a little. Use the dashboard price in the payment link.

## Settings in meat-menu.js

- `delivery.minimumOrder`: smallest estimated meat total for delivery (default $40).
- `delivery.times`: delivery time windows.
- Goat and veal stay limited to Friday and Saturday for delivery too.
