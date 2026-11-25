# v3-Server (Fastify + better-sqlite3). Build-Kontext: Repo-Wurzel (Monorepo).
# better-sqlite3 lädt seine mitgelieferten Prebuilds (linuxmusl-x64/arm64), das Install-Skript ist per
# allowScripts verweigert (DECISIONS A-012); das npm im Image (v10) kennt allowScripts nicht, daher --ignore-scripts.
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund && npx tsc -b apps/server && npm prune --omit=dev --ignore-scripts

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "apps/server/dist/main.js"]
