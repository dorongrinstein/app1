FROM nginx:stable-alpine
COPY snake-app/nginx.conf /etc/nginx/nginx.conf
COPY snake-app/public/ /usr/share/nginx/html/
USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx", "-g", "daemon off;"]
