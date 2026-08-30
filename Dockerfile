FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.json ./
COPY src ./src/
COPY migrations ./migrations/

RUN npm install --omit=dev && npm install -g tsx

ENV NODE_ENV=production
ENV BOT_ENTRYPOINT=whatsapp
CMD npx tsx src/index-${BOT_ENTRYPOINT}.ts
