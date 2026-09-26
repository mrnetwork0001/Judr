# Judr — single long-lived process. glibc base: the Coinbase SDKs' native
# fallbacks misbehave under musl.
#
# The demo vault is in-memory and session-scoped, so the app must run as ONE
# process. Serverless hosts split the arbitration stream and the vault read
# across instances and the settlement panel never sees the verdict. Any host
# that runs a container (Render, Fly, Railway) is fine.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The lockfile is written by npm 11; npm 10 in the base image reads optional
# peers differently and refuses it. Match the lock's author.
RUN npm install -g npm@11 && npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd --system judr && useradd --system --gid judr --no-create-home judr
COPY --from=build --chown=judr:judr /app/.next/standalone ./
COPY --from=build --chown=judr:judr /app/.next/static ./.next/static
COPY --from=build --chown=judr:judr /app/public ./public
USER judr
EXPOSE 3000
CMD ["node", "server.js"]
