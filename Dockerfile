FROM node:24-bookworm-slim AS build
ARG CANOPY_BUILD_COMMIT
ENV CANOPY_BUILD_COMMIT=${CANOPY_BUILD_COMMIT}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production CANOPY_MODE=private CANOPY_HOST=0.0.0.0 PORT=4317 CANOPY_DATA_DIR=/var/lib/canopy CANOPY_WORKSPACE=/projects/default CANOPY_PROJECTS_ROOT=/projects CANOPY_PASSWORD_FILE=/var/lib/canopy/owner-password.hash CANOPY_TRUST_PROXY=1 CANOPY_TERMINAL_POLICY=disabled
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force && mkdir -p /var/lib/canopy /projects/default /backups && chown -R node:node /var/lib/canopy /projects /backups
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 4317
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node", "-e", "fetch('http://127.0.0.1:4317/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist-server/index.js"]
