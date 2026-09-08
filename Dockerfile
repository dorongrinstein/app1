FROM nginx:stable-alpine
COPY index.html game.js /usr/share/nginx/html/
EXPOSE 80
