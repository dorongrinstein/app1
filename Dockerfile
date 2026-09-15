FROM node:24-alpine AS test
WORKDIR /app
COPY package.json server.mjs schema.sql test.mjs ./
COPY public ./public
RUN node --check server.mjs && node --check public/app.js && npm test

FROM node:24-alpine
WORKDIR /app
COPY --from=test /app/package.json /app/server.mjs /app/schema.sql ./
COPY --from=test /app/public ./public
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
EXPOSE 8080
CMD ["node", "server.mjs"]
