FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
# tsx is needed to run the dedicated TypeScript worker; keep the locked dev dependencies.
RUN npm ci --include=dev --ignore-scripts && npm cache clean --force
COPY tsconfig.json ./
COPY src/lib/telegram-mtproto.ts ./src/lib/
COPY src/lib/telegram-mtproto-shopee.ts src/lib/shopee-saved.ts ./src/lib/
COPY src/lib/mirrored-offers.ts ./src/lib/
COPY src/lib/shopee-freshness.ts src/lib/shopee-limits.ts ./src/lib/
COPY src/server/shopee/resolve-link.ts src/server/shopee/client.ts src/server/shopee/budget.ts src/server/shopee/product-offers.ts ./src/server/shopee/
COPY src/server/mtproto ./src/server/mtproto
COPY src/server/mercado-livre/oauth-core.ts ./src/server/mercado-livre/
COPY scripts/telegram-mtproto-worker.ts ./scripts/
ENV NODE_ENV=production TELEGRAM_MTPROTO_WORKER_HOST=0.0.0.0 TELEGRAM_MTPROTO_WORKER_PORT=8081
USER node
EXPOSE 8081
CMD ["node", "--import", "tsx", "scripts/telegram-mtproto-worker.ts"]
