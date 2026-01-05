# Garmin Authentication Server
# Handles Garmin OAuth with MFA support via Garth

FROM python:3.12-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy server code
COPY server.py .

# Create directories for tokens
RUN mkdir -p /root/.garth /app/data

# Environment
ENV PYTHONUNBUFFERED=1
ENV GARTH_DIR=/root/.garth
ENV TOKEN_FILE=/app/data/garmin-tokens.json
ENV AUTH_HOST=0.0.0.0
ENV AUTH_PORT=5050

EXPOSE 5050

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5050/health || exit 1

CMD ["python", "server.py"]

