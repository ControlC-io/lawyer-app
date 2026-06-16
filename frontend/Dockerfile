# Frontend Dockerfile
FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/
COPY backend/package*.json ./backend/

# Work around npm optional deps bug (https://github.com/npm/cli/issues/4828):
# lockfile from host platform can prevent linux-arm64-musl Rollup binary from being installed.
RUN rm -f package-lock.json && npm install

COPY . .

# Build shared (needed by both dev and prod)
RUN npm run build -w shared

EXPOSE 3000

CMD ["npm", "run", "dev", "-w", "frontend", "--", "--host"]
