# --- Stage 1: SheetJS-Bibliothek lokal bereitstellen ------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
# xlsx-Bundle in den vendor-Ordner kopieren (offline nutzbar)
RUN mkdir -p vendor && cp node_modules/xlsx/dist/xlsx.full.min.js vendor/xlsx.full.min.js

# --- Stage 2: Statisches Hosting via nginx ----------------------------------
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY impressum.html /usr/share/nginx/html/impressum.html
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY --from=build /app/vendor/ /usr/share/nginx/html/vendor/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
