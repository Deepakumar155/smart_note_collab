# Use a lightweight Node.js and Python base
FROM node:22-slim

# Install Python and OpenJDK
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python-is-python3 \
    openjdk-17-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

# Create a non-privileged user
RUN useradd -m sandbox
USER sandbox
WORKDIR /home/sandbox

# No default command; will be overridden by the executor
CMD ["node", "-v"]
