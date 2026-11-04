# The tag must match the @playwright/test version in package.json. See ADR-037.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /e2e
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
