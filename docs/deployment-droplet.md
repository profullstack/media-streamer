# Deploying to DigitalOcean Droplet

This guide explains how to deploy BitTorrented to a DigitalOcean Droplet with full UDP support for DHT peer discovery.

## Table of Contents

1. [Why Droplet Instead of App Platform?](#why-droplet-instead-of-app-platform)
2. [Prerequisites](#prerequisites)
3. [Step 1: Create a Droplet](#step-1-create-a-droplet)
4. [Step 2: Add a Domain](#step-2-add-a-domain)
5. [Step 3: Configure Firewall](#step-3-configure-firewall)
6. [Step 4: Initial Server Setup](#step-4-initial-server-setup)
7. [Step 5: Configure GitHub Secrets](#step-5-configure-github-secrets)
8. [Step 6: Configure Nginx](#step-6-configure-nginx-recommended)
9. [Step 7: Setup SSL](#step-7-setup-ssl-with-lets-encrypt)
10. [Step 8: Deploy](#step-8-deploy)
11. [Verify DHT is Working](#verify-dht-is-working)
12. [Troubleshooting](#troubleshooting)

---

## Why Droplet Instead of App Platform?

DigitalOcean App Platform **does not support UDP**, which means:
- ❌ DHT (Distributed Hash Table) won't work
- ❌ UDP trackers won't work
- ❌ Many torrents won't connect

A Droplet is a VPS with full networking control, allowing UDP for DHT.

## Prerequisites

1. A DigitalOcean account
2. A domain name (optional but recommended)
3. SSH key pair

## Step 1: Create a Droplet

1. Go to DigitalOcean → Create → Droplets
2. Choose:
   - **Image**: Ubuntu 24.04 LTS
   - **Plan**: Basic, $12/month (2GB RAM recommended for transcoding)
   - **Datacenter**: Choose closest to your users
   - **Authentication**: SSH Key (add your public key)
3. Click "Create Droplet"
4. Note your Droplet's IP address (e.g., `143.198.xxx.xxx`)

## Step 2: Add a Domain

You have two options for adding a domain to your Droplet:

### Option A: Use DigitalOcean DNS (Recommended)

This is the easiest method if you want DigitalOcean to manage your DNS.

1. **Add your domain to DigitalOcean:**
   - Go to **Networking → Domains**
   - Enter your domain name (e.g., `bittorrented.com`)
   - Click **Add Domain**

2. **Create DNS records:**
   
   | Type | Hostname | Value | TTL |
   |------|----------|-------|-----|
   | A | @ | Your Droplet IP | 3600 |
   | A | www | Your Droplet IP | 3600 |
   | CNAME | * | @ | 3600 |

   - Click **Create Record** for each

3. **Update your domain registrar's nameservers:**
   
   At your domain registrar (GoDaddy, Namecheap, Google Domains, etc.), change the nameservers to:
   ```
   ns1.digitalocean.com
   ns2.digitalocean.com
   ns3.digitalocean.com
   ```

4. **Wait for DNS propagation** (can take up to 48 hours, usually 15-30 minutes)

### Option B: Point DNS from Your Registrar

If you want to keep DNS at your registrar:

1. **At your domain registrar**, add these DNS records:

   | Type | Name | Value | TTL |
   |------|------|-------|-----|
   | A | @ | Your Droplet IP | 300 |
   | A | www | Your Droplet IP | 300 |

2. **Verify DNS is working:**
   ```bash
   # Check if domain points to your Droplet
   dig +short bittorrented.com
   # Should return your Droplet IP
   
   # Or use nslookup
   nslookup bittorrented.com
   ```

### Verify Domain Setup

```bash
# Test from your local machine
curl -I http://YOUR_DOMAIN.com

# Or ping
ping YOUR_DOMAIN.com
```

You should see your Droplet's IP address in the response.

## Step 3: Configure Firewall

Go to **Networking → Firewalls** and create a firewall with these rules:

### Inbound Rules

| Type | Protocol | Port Range | Sources |
|------|----------|------------|---------|
| SSH | TCP | 22 (or custom port) | Your IP or All |
| HTTP | TCP | 80 | All IPv4, All IPv6 |
| HTTPS | TCP | 443 | All IPv4, All IPv6 |
| Custom | TCP | 3000 | All IPv4, All IPv6 |
| **Custom** | **UDP** | **6881-6889** | **All IPv4, All IPv6** |
| **Custom** | **TCP** | **6881-6889** | **All IPv4, All IPv6** |

> **Security Tip:** Consider changing the SSH port from 22 to a non-standard port (e.g., 2048) to reduce automated attacks. If you do, update the `DROPLET_PORT` GitHub secret accordingly.

### Outbound Rules

| Type | Protocol | Port Range | Destinations |
|------|----------|------------|--------------|
| All TCP | TCP | All | All IPv4, All IPv6 |
| All UDP | UDP | All | All IPv4, All IPv6 |

Apply the firewall to your Droplet.

## Step 4: Initial Server Setup

SSH into your Droplet:

```bash
ssh root@YOUR_DROPLET_IP
```

The automated setup script handles everything. Just clone the repo and run it:

```bash
# Clone your repository
git clone https://github.com/YOUR_USERNAME/music-torrent.git /home/ubuntu/www/bittorrented.com/media-streamer
cd /home/ubuntu/www/bittorrented.com/media-streamer

# Create .env file
cp .env.example .env
nano .env  # Edit with your values (see Environment Variables section)

# Run the idempotent setup script
bash scripts/setup-server.sh
```

The setup script automatically installs and configures:
- Node.js 22
- pnpm
- FFmpeg (for transcoding)
- Redis (for IPTV playlist caching)
- Nginx (reverse proxy with SSL)
- systemd service (process management)
- fail2ban (security)
- UFW firewall

## Step 5: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `DROPLET_HOST` | Your Droplet IP address |
| `DROPLET_USER` | `root` (or your user) |
| `DROPLET_SSH_KEY` | Your private SSH key (the one that matches the public key on the Droplet) |
| `DROPLET_PORT` | `22` (optional, defaults to 22) |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |

### How to get your SSH private key:

```bash
# On your local machine
cat ~/.ssh/id_rsa
# Or if using ed25519
cat ~/.ssh/id_ed25519
```

Copy the entire contents including `-----BEGIN ... KEY-----` and `-----END ... KEY-----`.

## Step 6: Configure Nginx (Recommended)

Create Nginx config:

```bash
nano /etc/nginx/sites-available/bittorrented
```

Add:

```nginx
server {
    listen 80;
    server_name bittorrented.com www.bittorrented.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for streaming
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        
        # Disable buffering for streaming
        proxy_buffering off;
    }
}
```

Enable the site:

```bash
ln -s /etc/nginx/sites-available/bittorrented /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

## Step 7: Setup SSL with Let's Encrypt

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d bittorrented.com -d www.bittorrented.com
```

## Step 8: Deploy

Push to the `main` branch and GitHub Actions will automatically deploy:

```bash
git push origin main
```

Or trigger manually from GitHub Actions → Deploy to Droplet → Run workflow.

## Verify DHT is Working

After deployment, check the logs:

```bash
# View recent logs
tail -100 /var/log/bittorrented.com.log

# Follow logs in real-time
tail -f /var/log/bittorrented.com.log
```

Look for:
```
DHT connected to first node - UDP is working!
DHT node count: 50
```

If you see `DHT has 0 nodes after 10 seconds`, UDP is still blocked.

## Troubleshooting

### DHT not working

1. Check firewall rules include UDP 6881-6889 inbound
2. Check UFW (if enabled): `ufw status`
3. Test UDP: `nc -u -v router.bittorrent.com 6881`

### App not starting

```bash
# Check service status
sudo systemctl status bittorrented

# View logs
tail -100 /var/log/bittorrented.com.log
tail -100 /var/log/bittorrented.com.error.log

# Restart service
sudo systemctl restart bittorrented
```

### Port 3000 not accessible

```bash
# Check if app is listening
ss -tlnp | grep 3000

# Check Nginx
nginx -t
systemctl status nginx
```

### Redis not working

```bash
# Check Redis status
systemctl status redis-server

# Test Redis connection
redis-cli ping
# Should return: PONG

# Restart Redis
sudo systemctl restart redis-server
```

## Environment Variables

Create `/var/www/bittorrented/.env`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Redis (for IPTV playlist caching)
REDIS_URL=redis://localhost:6379

# App
NODE_ENV=production
PORT=3000
```

### Verify Redis is Running

```bash
# Check Redis status
systemctl status redis-server

# Test Redis connection
redis-cli ping
# Should return: PONG
```
