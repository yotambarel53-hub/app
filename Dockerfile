FROM node:20-alpine AS base
WORKDIR /app

# Install deps and build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production image
FROM node:20-alpine AS prod
WORKDIR /app
COPY --from=base /app/dist ./dist
COPY --from=base /app/package*.json ./
RUN npm ci --production

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
