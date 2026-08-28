FROM node:22-alpine
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json ./
COPY src ./src/

RUN corepack enable && pnpm install

ENV NODE_ENV=production
CMD ["npx", "tsx", "src/index.ts"]
