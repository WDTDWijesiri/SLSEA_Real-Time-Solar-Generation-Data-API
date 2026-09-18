FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodeapp && adduser -S nodeapp -G nodeapp
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=nodeapp:nodeapp . .
USER nodeapp
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && node scripts/seed.js && node src/server.js"]
