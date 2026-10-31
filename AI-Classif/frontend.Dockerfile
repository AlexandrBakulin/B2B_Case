# Use the Debian-based Node image for the Vite build stage.
# node:22-alpine has a known npm ci/npm install "Exit handler never called"
# failure in current Node 22 + Alpine combinations.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Keep dependency installation reproducible and use the public npm registry.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY index.html vite.config.ts tsconfig*.json postcss.config.js tailwind.config.js components.json ./
COPY src ./src
COPY public ./public

RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
