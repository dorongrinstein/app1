FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node server.js index.html ./
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node","server.js"]
