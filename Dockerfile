# Patternwright Production Core — Node 22+ with built-in SQLite
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    PATTERNWRIGHT_DB=/data/patternwright.db \
    PATTERNWRIGHT_TRUST_PROXY=true \
    PATTERNWRIGHT_SECURE_COOKIES=true

COPY package.json server.mjs ./
COPY public ./public

RUN mkdir -p /data \
 && useradd --system --uid 10001 --home /app pw \
 && chown -R pw:pw /app /data

USER pw
EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node","server.mjs"]
