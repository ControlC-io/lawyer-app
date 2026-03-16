FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY mcp-server/package*.json ./mcp-server/
COPY shared/package*.json ./shared/
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN npm install

COPY . .

RUN npm run build -w mcp-server

EXPOSE 3002

CMD ["npm", "run", "start", "-w", "mcp-server"]
