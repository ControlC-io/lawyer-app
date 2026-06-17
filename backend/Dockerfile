# Backend Dockerfile — multi-stage
# Stage 1: build everything (TypeScript → JS, Prisma client generation)
FROM node:18-alpine AS builder
RUN apk add --no-cache openssl libc6-compat
ENV PRISMA_CLI_QUERY_ENGINE_TYPE=library
ENV PRISMA_CLIENT_ENGINE_TYPE=library
# Force development so Coolify's injected NODE_ENV=production ARG doesn't skip devDependencies
ENV NODE_ENV=development
WORKDIR /usr/src/app
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/
COPY frontend/package*.json ./frontend/
RUN --mount=type=cache,id=npm-backend,target=/root/.npm npm install
COPY . .
RUN npm run build -w shared
RUN npm run build -w backend

# Stage 2: lean runtime — no TypeScript toolchain, no dev server
FROM node:18-alpine AS runtime
RUN apk add --no-cache openssl libc6-compat
ENV PRISMA_CLI_QUERY_ENGINE_TYPE=library
ENV PRISMA_CLIENT_ENGINE_TYPE=library
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/
COPY frontend/package*.json ./frontend/
# Copy node_modules from builder (includes prisma CLI needed for migrate:deploy)
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/backend/node_modules ./backend/node_modules
# Copy compiled output
COPY --from=builder /usr/src/app/backend/dist ./backend/dist
COPY --from=builder /usr/src/app/shared/dist ./shared/dist
# Copy prisma schema + migrations (needed at runtime by migrate:deploy)
COPY backend/prisma ./backend/prisma
COPY backend/scripts ./backend/scripts
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "backend"]
