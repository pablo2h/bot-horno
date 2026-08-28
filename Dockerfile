FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.json ./
COPY src ./src/

RUN npm install --omit=dev && npm install -g tsx

ENV NODE_ENV=production
CMD ["npx", "tsx", "src/index.ts"]
