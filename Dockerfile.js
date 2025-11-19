FROM node:lts-buster

# Install required system packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        imagemagick \
        webp && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /usr/src/app

# Copy only package files first for caching
COPY package*.json ./

# Install dependencies
RUN npm install --silent && \
    npm install -g qrcode-terminal pm2 --silent

# Copy full project
COPY . .

# Expose port
EXPOSE 5000

# Start command
CMD ["npm", "start"]