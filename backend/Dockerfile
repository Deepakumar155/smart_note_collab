FROM node:20-alpine

# Install Python and other build essentials
RUN apk add --no-cache python3 py3-pip make g++
# Create a symlink to use 'python' command
RUN ln -sf python3 /usr/bin/python

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

COPY package*.json ./

RUN npm install --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]