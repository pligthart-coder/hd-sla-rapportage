# Carerix RSS Feed — Self-Hosted Installation Guide

This guide explains how to run the Carerix RSS feed server on your own infrastructure, independent of Vercel.

## Prerequisites

- **Node.js 18+** (uses built-in `fetch`, no npm dependencies)
- **Carerix OAuth2 credentials** (client ID, client secret, token endpoint)

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/pligthart-coder/hd-sla-rapportage.git
cd hd-sla-rapportage

# 2. Configure credentials
cp .env.example .env
# Edit .env and fill in your Carerix credentials

# 3. Run
node server.js
```

The feed is available at `http://localhost:3000/api/rss`.

---

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `CARERIX_CLIENT_ID` | Yes | — | OAuth2 client ID from Carerix |
| `CARERIX_CLIENT_SECRET` | Yes | — | OAuth2 client secret |
| `CARERIX_TOKEN_ENDPOINT` | Yes | — | OAuth2 token URL (e.g. `https://yourcompany.carerix.com/cxoauth2/token`) |
| `PORT` | No | `3000` | HTTP server port |
| `CACHE_TTL_SECONDS` | No | `3600` | How long to cache the feed in memory (seconds) |

---

## Deployment Options

### Option 1: Direct Node.js (VPS / bare metal)

```bash
# Install Node.js 20 LTS (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and configure
git clone https://github.com/pligthart-coder/hd-sla-rapportage.git
cd hd-sla-rapportage
cp .env.example .env
nano .env  # fill in credentials

# Run with pm2 (process manager — auto-restart on crash)
npm install -g pm2
pm2 start server.js --name carerix-rss
pm2 save
pm2 startup  # auto-start on boot
```

### Option 2: Docker

```bash
# Build the image
docker build -t carerix-rss-feed .

# Run with credentials
docker run -d \
  --name carerix-rss-feed \
  --restart unless-stopped \
  -p 3000:3000 \
  -e CARERIX_CLIENT_ID=your-client-id \
  -e CARERIX_CLIENT_SECRET=your-client-secret \
  -e CARERIX_TOKEN_ENDPOINT=https://yourcompany.carerix.com/cxoauth2/token \
  carerix-rss-feed
```

### Option 3: Docker Compose

```bash
# Configure credentials
cp .env.example .env
nano .env  # fill in credentials

# Start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Option 4: systemd Service (Linux)

Create `/etc/systemd/system/carerix-rss.service`:

```ini
[Unit]
Description=Carerix RSS Feed Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/carerix-rss-feed
EnvironmentFile=/opt/carerix-rss-feed/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:

```bash
# Copy files
sudo mkdir -p /opt/carerix-rss-feed
sudo cp server.js package.json /opt/carerix-rss-feed/
sudo cp .env.example /opt/carerix-rss-feed/.env
sudo nano /opt/carerix-rss-feed/.env  # fill in credentials

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable carerix-rss
sudo systemctl start carerix-rss

# Check status
sudo systemctl status carerix-rss
journalctl -u carerix-rss -f
```

---

## Reverse Proxy (Nginx)

To serve the feed on port 80/443 with SSL:

```nginx
server {
    listen 80;
    server_name rss.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }
}
```

Add SSL with Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d rss.yourdomain.com
```

---

## Endpoints

| Path | Description |
|---|---|
| `/api/rss` | RSS 0.91 XML feed |
| `/` | Same as `/api/rss` |
| `/health` | JSON health check (`{"status":"ok","cached":true,"cacheAge":123}`) |

---

## Notes

- **Zero npm dependencies** — the server uses only Node.js built-in modules (`http`, `fs`, `path`) and the native `fetch` API (Node 18+).
- **In-memory cache** — the feed is cached for 1 hour by default. The first request after startup will take ~40-50 seconds while it fetches all publications from the Carerix API.
- **The Vercel deployment** (`api/rss.js` + `vercel.json`) continues to work independently. The standalone `server.js` is an alternative for self-hosting.
