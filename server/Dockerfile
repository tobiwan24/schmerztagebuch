# Backend-API (Fastify + better-sqlite3). Lauscht ausschließlich intern auf
# :3000 — kein Host-Port-Binding (siehe docker-compose.yml im Repo-Root).
#
# node:20-alpine für Build UND Runtime (gleiche musl-libc-Basis), damit das
# nativ kompilierte better-sqlite3-Addon aus dem Builder-Stage im
# Runtime-Stage ohne erneuten Build/Netzwerkzugriff lauffähig ist.

FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# node_modules 1:1 aus dem Builder-Stage übernehmen (inkl. bereits kompiliertem
# better-sqlite3-Addon) statt im Runtime-Stage erneut zu installieren — das
# spart Build-Tools/Netzwerkzugriff im schlanken Runtime-Image.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 3000
CMD ["node", "dist/index.js"]
