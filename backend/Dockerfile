# Backend Dockerfile
FROM node:18-alpine

# Install OpenSSL and libc6-compat for Prisma engine
RUN apk add --no-cache openssl libc6-compat

# Set Prisma engine environment variables
# In Alpine, 'library' engine is generally more stable than 'binary'
ENV PRISMA_CLI_QUERY_ENGINE_TYPE=library
ENV PRISMA_CLIENT_ENGINE_TYPE=library

WORKDIR /usr/src/app

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm install

COPY . .

# Build shared first
RUN npm run build -w shared

# Generate Prisma Client during build
RUN npx prisma generate --schema=./backend/prisma/schema.prisma

# Build backend
RUN npm run build -w backend

EXPOSE 3001

CMD ["npm", "run", "dev", "-w", "backend"]
