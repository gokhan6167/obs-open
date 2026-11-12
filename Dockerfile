# OBS api üretim imajı (Faz 9). Multi-stage: build -> ince runtime.
# Tek imaj hem on-prem (DEPLOYMENT_MODE=single-tenant) hem SaaS (multi-tenant).
# Web rolü varsayılan; worker (BullMQ) rolü ileride ayrı CMD ile aynı imajdan.

FROM node:22-alpine AS build
# argon2 native derleme için build araçları.
RUN apk add --no-cache python3 make g++ libc6-compat
RUN corepack enable
WORKDIR /repo

# Sadece gerekli workspace parçaları (bağımlılık katmanı önbelleklensin).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json .npmrc ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @obs/academic-core build && pnpm --filter @obs/api build
# Kendi kendine yeten prod dağıtım (workspace deps enjekte, devDeps hariç).
RUN pnpm --filter @obs/api deploy --prod /prod/api

FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
ENV DEPLOYMENT_MODE=single-tenant
ENV API_PORT=3000
WORKDIR /app
# node:alpine yerleşik 'node' kullanıcısı (uid 1000) ile çalış — root DEĞİL (least privilege).
COPY --from=build --chown=node:node /prod/api ./
USER node

EXPOSE 3000
# Sağlık kontrolü (installer/upgrade.sh bunu kullanır).
HEALTHCHECK --interval=15s --timeout=5s --retries=10 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
