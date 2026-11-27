FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=8080 DATA_FILE=/data/db.json
VOLUME /data
EXPOSE 8080
USER node
CMD ["node", "server.js"]
