# v3-Web (statisch, nginx). Build-Kontext: v3/ (Monorepo-Wurzel). Stufe 1 baut die App (Vite), Stufe 2 liefert sie aus;
# /api geht an den Server (nginx.conf). VITE_V2_API_URL optional für eine abweichende v2-Adresse (Migration, A-033).
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
ARG VITE_V2_API_URL=""
ENV VITE_V2_API_URL=${VITE_V2_API_URL}
RUN npm ci --ignore-scripts --no-audit --no-fund && npx tsc -b packages/core packages/crypto packages/sync-protocol packages/analysis packages/export && npm run build -w @stb/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist/ /usr/share/nginx/html/
