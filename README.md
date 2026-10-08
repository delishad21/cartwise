# multi-store-shopping-site

A pretend multi-store shop, used in primary school lessons on budgeting, sums and percentages. Groups get a gift card with a budget, buy bicycle parts across several stores (each with its own discounts, shipping and GST), and justify their picks. A password-protected teacher dashboard at `/admin` shows the orders as they come in and manages everything else.

## How it fits together

One Node process (`shopping-app/server`) serves:

- **the shop**: the React app in `shopping-app/src`.
- **`/api`**: store data, voucher checks and checkout. The server re-prices every order with the same `src/lib/pricing.ts` and `src/lib/quote.ts` the browser uses. In one transaction, it uses up the voucher codes, charges the gift card and records the order. Codes and card numbers are never sent to students' browsers.
- **`/admin`**: the teacher dashboard.
  - Live orders, with void & refund and CSV export
  - Voucher codes (single use, generate, reset)
  - Gift cards (balances, group assignment, generate)
  - Stores, items and photos
  - Printable gift card and voucher sheets
  - Settings, and "reset for a new lesson"

Data lives in SQLite (`shop.db` plus an `uploads/` folder of photos) in `DATA_DIR`. There's no Google Sheet any more. Download the orders CSV from `/admin` if you want a spreadsheet.

### Rules the server enforces

- A voucher code works **once**, across all groups. "Make usable again" in `/admin` releases it.
- Only one percentage voucher per order. Dollar vouchers stack, up to the discount cap in Settings.
- A gift card's balance goes down as it's spent. A card assigned to a group can only be used by that group.
- At most `maxQtyPerItem` of each item. The group must be one from the list in Settings.

## Running it

Requires Node 22.13+ (it uses the built-in `node:sqlite`).

```bash
cd shopping-app
npm install
echo "ADMIN_PASSWORD=pick-something" > .env

npm run dev:server   # API on :3000 (restarts on change)
npm run dev          # shop on http://localhost:5173 (proxies /api to :3000)
```

On first start, the server imports `shopping-app/seed/*.json` into an empty database (see [Seed data](#seed-data)). For a demo without real data, copy `seed.sample/` to `seed/` and `public/sample-img/` to `public/img/`.

### Deploying (Docker)

```bash
cd shopping-app
echo "ADMIN_PASSWORD=pick-something" > .env
docker compose up -d --build
```

- The container listens on **port 3000** and keeps its database in the `bike-shop-data` volume.
- `seed/` and `public/img/` are gitignored, so build from a checkout that has them.
- `nginx/bike-shop.conf` is a sample reverse proxy (TLS, plus a 10 MB upload limit for product photos).

Environment variables:

| Variable         | Default  | Purpose                                         |
| ---------------- | -------- | ----------------------------------------------- |
| `ADMIN_PASSWORD` | _(none)_ | Password for `/admin`. If unset, `/admin` is off. |
| `PORT`           | `3000`   |                                                 |
| `DATA_DIR`       | `data`   | Where `shop.db` and `uploads/` live             |
| `SEED_DIR`       | `seed`   | JSON imported when the database is empty        |
| `STATIC_DIR`     | `dist`   | Built shop to serve                             |

## Before each lesson

In `/admin`:

1. **Settings**: set the groups (e.g. "Make groups 1 to 55"), the gift card "From" and "Valid until" lines, and the discount cap.
2. **Gift Cards**: generate one card per group (each one is assigned to a group automatically), or use "Set budget for all".
3. **Vouchers**: generate codes for each value.
4. **Printables**: open the gift card sheets (12 per A4, rounded up with blank backups) and voucher tear-off strips, then print at 100% scale with background graphics on.
5. **Overview → Start a new lesson**: clears last time's orders, makes vouchers usable again and refills cards.

## Pricing

Each store is priced separately, then the store totals are summed and voucher codes are applied to the grand total.

For each store:

1. `itemsSubtotal`: sum of price × qty.
2. **Every Nth item % off** (`nthItemPercent`): for every N units in the cart, the cheapest unit gets the discount.
3. **Storewide % off** (`overallPercent`): applied after step 2, spread across the items.
4. **Shipping**: if the items total (after discounts) is at least `threshold`, shipping is reduced by `shippingPercentOff` (100 = free).
5. **GST** (9% by default) on the **items only**, not shipping.
6. `storeTotal = itemsNet + gst + shippingNet`.

Money is rounded to 2 decimals at each step.

Voucher codes are then applied to the sum of the store totals. The combined discount is capped by `discountCap.absoluteMax` (dollars) and `discountCap.percentMax` (% of the total), and can never exceed the total itself.

## Seed data

`shopping-app/seed/` holds the data that gets imported into a fresh database. After that, `/admin` is the source of truth.

- `index.json`: settings, the store list and voucher codes:
  ```json
  {
    "title": "School Cart",
    "gst": 0.09,
    "classes": ["1", "2", "3"],
    "alerts": [{ "message": "Welcome!", "severity": "info" }],
    "discountCap": { "percentMax": 100, "absoluteMax": 250 },
    "discountCodes": [{ "code": "WELCOME10", "kind": "absolute", "amount": 10, "description": "S$10 off" }],
    "stores": [{ "id": "rodalink", "name": "Rodalink", "cover": "/img/covers/rodalink.jpg" }],
    "giftCardFrom": "Runner Tan",
    "giftCardValidUntil": "31 December 2026"
  }
  ```
- `{storeId}.json`: one per store:
  ```json
  {
    "id": "rodalink",
    "name": "Rodalink",
    "showDiscountBreakdown": true,
    "alerts": [{ "message": "18% storewide discount applied at checkout.", "severity": "success" }],
    "shipping": { "baseFee": 35 },
    "constraints": { "maxQtyPerItem": 3 },
    "discounts": [
      { "type": "overallPercent", "percentOff": 18 },
      { "type": "shippingThreshold", "threshold": 100, "shippingPercentOff": 100 }
    ],
    "products": [{ "sku": "bell", "name": "Bell", "price": 15, "img": "/img/rodalink/bell.png" }]
  }
  ```
- `cards.json`: gift cards. `group` is optional; leave it out and any group can use the card.
  ```json
  { "cards": [{ "number": "777700000001", "group": "1", "balance": 1300 }] }
  ```

`showDiscountBreakdown: false` hides the per-item discount lines, so students have to work the discounts out themselves.
