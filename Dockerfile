FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
COPY data/fixtures ./data/fixtures
ARG VITE_BACKGROUND_TRACK_URL=""
ENV VITE_BACKGROUND_TRACK_URL=${VITE_BACKGROUND_TRACK_URL}
RUN npm run build && test -s dist/data/rock-catalog-v3/current.json
FROM nginx:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.inc /etc/nginx/security-headers.inc
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
