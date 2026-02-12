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

# Build shared first
RUN npm run build -w shared
# Build frontend with empty VITE_API_URL so production uses relative /api (same origin via nginx)
ENV VITE_API_URL=
RUN npm run build -w frontend

EXPOSE 3000

CMD ["npm", "run", "dev", "-w", "frontend", "--", "--host"]
