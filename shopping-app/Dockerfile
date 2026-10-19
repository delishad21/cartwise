# ---- Build stage: client (vite) + server (esbuild) ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && mkdir -p seed

# ---- Runtime stage: one Node process serves the shop, /api and /admin ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    SEED_DIR=/app/seed \
    STATIC_DIR=/app/dist

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# store data imported into the database on first boot (when /data is empty);
# seed/ is gitignored, so a deploy from git ships an empty folder
COPY --from=build /app/seed ./seed

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "dist-server/index.mjs"]
