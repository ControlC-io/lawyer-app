# Frontend Dockerfile — multi-stage
# Stage 1: build the Vite SPA
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/
COPY backend/package*.json ./backend/
# Workaround: lockfile from host platform can block linux-arm64-musl Rollup binary
RUN rm -f package-lock.json && npm install
COPY . .
RUN npm run build -w shared
RUN npm run build -w frontend

# Stage 2: serve static files with nginx — no Node.js runtime needed
FROM nginx:alpine
COPY --from=builder /usr/src/app/frontend/dist /usr/share/nginx/html
COPY infrastructure/nginx/spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
