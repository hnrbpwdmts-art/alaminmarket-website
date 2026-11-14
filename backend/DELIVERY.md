# Delivery estimates (Uber Direct)

When a customer chooses Delivery and enters their address, the order page asks Uber
Direct for a price quote. **No driver is ever booked automatically.** The customer sees
"Estimated delivery: up to $X", where X is Uber's price plus `delivery.cushion`,
rounded up to the next dollar. You then deliver however you like: your own driver,
combined with other orders, or book Uber yourself.

If Uber can't quote (keys missing, Uber down), the page shows `delivery.note`
instead ("We'll text you the delivery fee...") and the customer can still order.

## Setup (one time)

1. In the Uber Direct dashboard, open **Developer** and copy the **Customer ID**,
   **Client ID**, and **Client secret**. Use the test keys first, then the live keys.
2. In Cloudflare: **Workers & Pages > alaminmarket-website > Settings > Variables and Secrets**.
   Add each of these as type **Secret**, for **Production** (and **Preview**, to test
   on preview links):
   - `UBER_CUSTOMER_ID`
   - `UBER_CLIENT_ID`
   - `UBER_CLIENT_SECRET`
   Optional:
   - `STORE_PHONE` = `+13105381188`
   - `DELIVERY_ZIPS` = ZIP codes you deliver to, separated by spaces, e.g. `90504 90501 90503`
     (leave out to allow anywhere Uber delivers)
3. After adding or changing secrets, redeploy once: **Deployments**, then the **...**
   on the latest one, then **Retry deployment**. Secrets apply to new deployments only.

## Everyday use

- Each order shows the estimate the customer saw and Uber's actual quote, e.g.
  `Delivery estimate shown: up to $13.00 (Uber quote $12.37 [dqt_...])`.
- To use Uber for an order, book it in the Uber Direct dashboard. Quotes expire after
  about 15 minutes, so the price when you book may differ a little.

## Settings in meat-menu.js

- `delivery.enabled`: `false` turns delivery off (pickup only).
- `delivery.cushion`: dollars added on top of Uber's price before rounding up (default 0).
- `delivery.minimumOrder`: smallest estimated meat total for delivery (default $40).
- `delivery.times`: delivery time windows.
- Goat and veal stay limited to Friday and Saturday for delivery too.
