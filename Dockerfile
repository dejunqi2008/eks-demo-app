FROM node:19-alpine

COPY package.json /app/
COPY app.js /app/
COPY routes /app/routes
COPY bin /app/bin

WORKDIR /app

RUN npm install

EXPOSE 3000
CMD [ "node", "./bin/www.js" ]