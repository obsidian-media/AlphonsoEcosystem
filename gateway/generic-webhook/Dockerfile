FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 8081
ENV NODE_ENV=production
CMD ["node", "src/server.js"]
