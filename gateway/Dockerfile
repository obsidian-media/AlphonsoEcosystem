FROM node:20-alpine AS builder
WORKDIR /app
COPY ./whatsapp-cloud/package*.json ./
RUN npm ci --omit=dev
COPY ./whatsapp-cloud/src ./src

FROM node:20-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY --from=builder /app .
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node", "src/server.js"]
