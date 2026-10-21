FROM node:20-alpine

LABEL maintainer="pligthart@gmail.com"
LABEL description="Carerix RSS Feed Server"

WORKDIR /app

# Copy only what's needed for the standalone server
COPY server.js ./
COPY package.json ./

# No npm install needed — zero dependencies (uses Node.js built-in fetch)

# Default port
ENV PORT=3000
ENV CACHE_TTL_SECONDS=3600

EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

USER node

CMD ["node", "server.js"]
