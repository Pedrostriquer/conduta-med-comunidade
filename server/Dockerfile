# O código já chega compilado em dist/ (deploy/deploy.sh roda o esbuild); aqui entram só as dependências de produção.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY dist ./dist
COPY migrations ./migrations
USER node
EXPOSE 8300
CMD ["node", "--enable-source-maps", "dist/index.js"]
