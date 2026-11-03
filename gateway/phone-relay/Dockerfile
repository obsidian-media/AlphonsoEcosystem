FROM node:24.22.2-alpine3.24
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && chown -R appuser:appgroup /app
USER appuser
EXPOSE 8080
ENV NODE_ENV=production
CMD ["node", "src/server.js"]
