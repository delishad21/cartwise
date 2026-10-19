# Home server deployment

```
browser ──HTTPS──▶ nginx :443 (shop.delishad.com, bicycle-shop.conf) ──▶ 127.0.0.1:8293  bike-shop (Node: shop, /api, /admin) ──▶ volume bike-shop_bike-shop-data (/data)
```

Deploying: say `ship <task>` or run `devbot deploy bike-shop`; `devbot rollback bike-shop` undoes it.

- Stack: [compose.yaml](../compose.yaml) at the repo root, image built on the server
  from [shopping-app/Dockerfile](../shopping-app/Dockerfile) and tagged with the commit
  (`bike-shop-bike-shop:<commit>`).
- Settings and secrets: `~/services/bike-shop/.env` (mode 600), see
  [bike-shop.env.example](bike-shop.env.example). Only `ADMIN_PASSWORD`.
- Health: `https://shop.delishad.com/api/health` (`{"ok":true}` once the database answers).
- Data: everything lives in the `bike-shop_bike-shop-data` volume, mounted at `/data`:
  `shop.db` (SQLite), `uploads/` (photos added in /admin) and `img/` (the product
  photos and store covers, see below). The nightly dump on the server tars it
  (it's in `LEGACY_VOLUMES` in `~/services/backup/app-dump.sh`; the volume
  predates the `backup` label, so keep that entry).
- nginx: the live site `/etc/nginx/sites-available/bicycle-shop.conf` stays as it
  is (it already proxies to 127.0.0.1:8293). [../nginx/bike-shop.conf](../nginx/bike-shop.conf)
  is only a generic sample.
- Logs: `docker logs bike-shop`.

### Product photos (`/img/...`)

`shopping-app/public/img/` and `shopping-app/seed/` are gitignored, and devbot only
uploads committed code, so they are no longer in the image. The server serves
`/img/...` from `/data/img` in the volume first (falling back to the built site, for
local builds). The database is already seeded, so `seed/` isn't needed on the server.

## First-time checklist (moving off Portainer stack 34)

1. Copy the product photos from the running Portainer container into the volume
   (once, before the first deploy; the old image still has them):

   ```sh
   docker exec bike-shop sh -c 'mkdir -p /data/img && cp -r /app/dist/img/. /data/img/'
   docker exec bike-shop ls /data/img   # covers, decathlon, kh-cycle, rodalink
   ```

2. Run `devbot adopt bike-shop 34` to copy the stack's `ADMIN_PASSWORD` into
   `~/services/bike-shop/.env`.
3. Ship (`ship <task>` or `devbot deploy bike-shop`). The first deploy stops and
   removes Portainer stack 34 (the volume and its data stay) and starts the new
   release on the same container name, volume and port.
4. Check https://shop.delishad.com: a store page shows its photos, and /admin logs in.
5. Optional: remove the old hand-deploy leftovers in `~/services/bike-shop/`
   (`app/`, the `bike-shop:latest` image, the README's rsync/Portainer steps).

## Deprecated

The old procedure (rsync `shopping-app/` to `~/services/bike-shop/app`,
`docker build -t bike-shop:latest`, then update Portainer stack 34 through its API)
is replaced by the standard deploy above. Don't use it after step 3.
