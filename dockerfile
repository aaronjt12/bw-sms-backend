# Use the official Node.js 18 image as the base
FROM node:18-slim

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if it exists) from the twilio-sms-server subdirectory
COPY twilio-sms-server/package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy the rest of the application code from the twilio-sms-server subdirectory
COPY twilio-sms-server/ ./

# Expose the port the app will run on (Railway will override this with PORT env var)
EXPOSE 3000

# Define the command to start the app
CMD ["node", "server.js"]

# Add a health check to verify the app is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:$PORT/ || exit 1