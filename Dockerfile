FROM node:22-alpine
WORKDIR /app
COPY server/ ./server/
COPY viewer/ ./viewer/
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server/server.mjs"]
