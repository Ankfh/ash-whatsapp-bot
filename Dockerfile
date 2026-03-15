FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY webhook.js ./

# We only need port 3001 for our bridge
EXPOSE 3001

USER node
CMD ["node", "webhook.js"]
