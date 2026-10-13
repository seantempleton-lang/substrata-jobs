FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# Coolify may expose NODE_ENV=production while building. Explicitly retain
# Vite and the other build-only dependencies in this stage.
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN apk add --no-cache wget \
  && npm ci --omit=dev \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/db ./db
COPY --from=build /app/src/domain ./src/domain

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "scripts/docker-start.mjs"]
