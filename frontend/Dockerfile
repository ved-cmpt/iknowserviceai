# Development image. Production hosting uses a static build (ADR-005).
FROM node:24-slim

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
