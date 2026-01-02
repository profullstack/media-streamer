#!/bin/bash
# Idempotent setup script for Ubuntu/Debian VPS
# Safe to run multiple times - only installs/configures what's missing
# Works on any VPS provider: DigitalOcean, Linode, Vultr, AWS EC2, Hetzner, etc.
#
# Run manually: bash scripts/setup-server.sh
# Or via GitHub Actions (runs automatically on deploy)
#
# Environment variables (set in .env file or export):
#   VPS_USER       - System user for the service (default: ubuntu)
#   CERTBOT_EMAIL  - Email for Let's Encrypt (default: admin@bittorrented.com)
#   SSH_PORT       - SSH port for firewall/fail2ban (default: 22)
#   FORCE_SSL      - Set to 1 to force SSL setup even if DNS check fails

set -e

# Load environment variables from .env file if it exists
# Uses a safe method that doesn't execute values as bash commands
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
if [ -f "${PROJECT_ROOT}/.env" ]; then
    echo "=== Loading environment from .env ==="
    # Only load simple KEY=value lines, skip comments and complex values
    # This safely handles values with special characters like parentheses
    while IFS='=' read -r key value; do
        # Skip empty lines and comments
        [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
        # Remove leading/trailing whitespace from key
        key=$(echo "$key" | xargs)
        # Skip if key is empty after trimming
        [[ -z "$key" ]] && continue
        # Only export if it's a valid variable name (letters, numbers, underscore)
        if [[ "$key" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
            # Remove surrounding quotes from value if present
            value="${value%\"}"
            value="${value#\"}"
            value="${value%\'}"
            value="${value#\'}"
            export "$key=$value"
        fi
    done < "${PROJECT_ROOT}/.env"
fi

# Configuration
DOMAIN="bittorrented.com"
REPO="media-streamer"
VPS_USER="${VPS_USER:-ubuntu}"  # Override with env var for different providers
DEPLOY_PATH="/home/${VPS_USER}/www/${DOMAIN}/${REPO}"
SERVICE_NAME="bittorrented"
NODE_VERSION="22"  # LTS version
PNPM_HOME="${HOME}/.local/share/pnpm"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@bittorrented.com}"  # Override with env var if needed
SSH_PORT="${SSH_PORT:-22}"  # Override with env var for custom SSH port (e.g., 2048)

echo "=== BitTorrented Server Setup (Idempotent) ==="
echo "Deploy path: ${DEPLOY_PATH}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Configure swap if not already present (needed for memory-intensive builds)
SWAP_FILE="/swapfile"
if [ ! -f "$SWAP_FILE" ]; then
    echo "=== Configuring swap (2GB) for builds ==="
    sudo fallocate -l 2G "$SWAP_FILE"
    sudo chmod 600 "$SWAP_FILE"
    sudo mkswap "$SWAP_FILE"
    sudo swapon "$SWAP_FILE"
    # Make swap permanent
    if ! grep -q "$SWAP_FILE" /etc/fstab; then
        echo "$SWAP_FILE none swap sw 0 0" | sudo tee -a /etc/fstab
    fi
    echo "✓ Swap configured"
else
    # Ensure swap is active
    if ! swapon --show | grep -q "$SWAP_FILE"; then
        sudo swapon "$SWAP_FILE" 2>/dev/null || true
    fi
    echo "=== Swap already configured ==="
fi

# Update system (only if not updated recently - within 1 hour)
LAST_UPDATE_FILE="/tmp/apt-last-update"
if [ ! -f "$LAST_UPDATE_FILE" ] || [ $(find "$LAST_UPDATE_FILE" -mmin +60 2>/dev/null) ]; then
    echo "=== Updating system packages ==="
    sudo apt-get update
    touch "$LAST_UPDATE_FILE"
else
    echo "=== System packages recently updated, skipping ==="
fi

# Install essential packages (only if missing)
echo "=== Checking essential packages ==="
PACKAGES_TO_INSTALL=""
for pkg in curl git build-essential ffmpeg rsync ufw fail2ban nginx certbot python3-certbot-nginx redis-server; do
    if ! dpkg -l | grep -q "^ii  $pkg "; then
        PACKAGES_TO_INSTALL="$PACKAGES_TO_INSTALL $pkg"
    fi
done

if [ -n "$PACKAGES_TO_INSTALL" ]; then
    echo "Installing:$PACKAGES_TO_INSTALL"
    sudo apt-get install -y $PACKAGES_TO_INSTALL
else
    echo "All essential packages already installed"
fi

# Enable and start Redis (for IPTV playlist caching)
echo "=== Configuring Redis ==="
sudo systemctl enable redis-server 2>/dev/null || true
sudo systemctl start redis-server 2>/dev/null || true
if systemctl is-active --quiet redis-server; then
    echo "✓ Redis is running"
else
    echo "WARNING: Redis failed to start"
fi

# Install Node.js if not present or wrong version
if ! command_exists node || ! node --version | grep -q "v${NODE_VERSION}"; then
    echo "=== Installing Node.js ${NODE_VERSION} ==="
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "=== Node.js $(node --version) already installed ==="
fi

# Install pnpm if not present
if ! command_exists pnpm; then
    echo "=== Installing pnpm ==="
    curl -fsSL https://get.pnpm.io/install.sh | sh -
else
    echo "=== pnpm $(pnpm --version 2>/dev/null || echo 'installed') already installed ==="
fi

# Add pnpm to PATH for this session
export PATH="$PNPM_HOME:$PATH"

# Add pnpm to bashrc if not already there
if ! grep -q "PNPM_HOME" ~/.bashrc 2>/dev/null; then
    echo "=== Adding pnpm to ~/.bashrc ==="
    echo '' >> ~/.bashrc
    echo '# pnpm' >> ~/.bashrc
    echo 'export PNPM_HOME="$HOME/.local/share/pnpm"' >> ~/.bashrc
    echo 'export PATH="$PNPM_HOME:$PATH"' >> ~/.bashrc
fi

# Create deploy directory if not exists
if [ ! -d "${DEPLOY_PATH}" ]; then
    echo "=== Creating deploy directory ==="
    mkdir -p "${DEPLOY_PATH}"
else
    echo "=== Deploy directory already exists ==="
fi

# Configure firewall (idempotent - ufw handles duplicates)
echo "=== Configuring firewall ==="
sudo ufw default deny incoming 2>/dev/null || true
sudo ufw default allow outgoing 2>/dev/null || true
# Allow SSH on configured port (default 22, can be overridden with SSH_PORT env var)
sudo ufw allow ${SSH_PORT}/tcp 2>/dev/null || true
sudo ufw allow 80/tcp 2>/dev/null || true
sudo ufw allow 443/tcp 2>/dev/null || true
sudo ufw allow 3000/tcp 2>/dev/null || true
sudo ufw allow 6881/tcp 2>/dev/null || true
sudo ufw allow 6881/udp 2>/dev/null || true
sudo ufw allow 6882:6889/udp 2>/dev/null || true

# Enable firewall if not already enabled
if ! sudo ufw status | grep -q "Status: active"; then
    sudo ufw --force enable
fi

# Configure fail2ban (only if config doesn't exist or SSH port changed)
FAIL2BAN_CONFIG="/etc/fail2ban/jail.local"
if [ ! -f "$FAIL2BAN_CONFIG" ] || ! grep -q "port = ${SSH_PORT}" "$FAIL2BAN_CONFIG" 2>/dev/null; then
    echo "=== Configuring fail2ban (SSH port: ${SSH_PORT}) ==="
    sudo tee "$FAIL2BAN_CONFIG" > /dev/null << EOF
[DEFAULT]
bantime = 600
findtime = 600
maxretry = 10

[sshd]
enabled = true
port = ${SSH_PORT}
filter = sshd
logpath = /var/log/auth.log
maxretry = 10
bantime = 600
EOF
    sudo systemctl restart fail2ban
else
    echo "=== fail2ban already configured for port ${SSH_PORT} ==="
fi

# Configure nginx reverse proxy
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
SSL_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

# Phase 1: Create initial HTTP-only config for certbot (if no SSL cert exists yet)
if [ ! -f "${SSL_CERT}" ]; then
    echo "=== Configuring nginx (HTTP-only for initial certbot setup) ==="
    sudo tee "${NGINX_SITE}" > /dev/null << 'EOF'
# Initial HTTP-only config for certbot validation
# This will be replaced with full HTTPS config after certbot runs
server {
    listen 80;
    listen [::]:80;
    server_name bittorrented.com www.bittorrented.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_buffering off;
    }

    location /api/health {
        proxy_pass http://127.0.0.1:3000/api/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    client_max_body_size 100M;
}
EOF
else
    echo "=== SSL certificate exists, configuring full HTTPS nginx ==="
fi

# Enable the site by creating symlink
if [ ! -L "/etc/nginx/sites-enabled/${DOMAIN}" ]; then
    sudo ln -s "${NGINX_SITE}" "/etc/nginx/sites-enabled/${DOMAIN}"
fi

# Remove default site if it exists and is enabled
if [ -L "/etc/nginx/sites-enabled/default" ]; then
    sudo rm /etc/nginx/sites-enabled/default
fi

# Test and reload nginx
echo "=== Testing nginx configuration ==="
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx

# Configure SSL with Let's Encrypt (only if certificate doesn't exist)
if [ ! -f "${SSL_CERT}" ]; then
    echo "=== Obtaining SSL certificate from Let's Encrypt ==="
    
    # Check if domain resolves to this server (basic check)
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "unknown")
    # Get all A records and check if any match (handles CNAME chains)
    DOMAIN_IPS=$(dig +short ${DOMAIN} A 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || echo "")
    DOMAIN_IP=$(echo "$DOMAIN_IPS" | head -1)
    
    echo "  Server IP: ${SERVER_IP}"
    echo "  Domain IPs: ${DOMAIN_IPS:-none}"
    
    # Check if server IP is in the list of domain IPs
    IP_MATCH=false
    if echo "$DOMAIN_IPS" | grep -q "^${SERVER_IP}$"; then
        IP_MATCH=true
    fi
    
    if [ "$IP_MATCH" = true ] || [ -n "${FORCE_SSL:-}" ]; then
        echo "Domain ${DOMAIN} resolves to this server (${SERVER_IP})"
        echo "Requesting SSL certificate..."
        
        # Run certbot in non-interactive mode
        sudo certbot --nginx \
            -d ${DOMAIN} \
            -d www.${DOMAIN} \
            --non-interactive \
            --agree-tos \
            --email ${CERTBOT_EMAIL} \
            --redirect \
            --staple-ocsp
        
        echo "=== SSL certificate obtained! ==="
        
        # Set up automatic renewal
        if ! systemctl is-enabled certbot.timer >/dev/null 2>&1; then
            sudo systemctl enable certbot.timer
            sudo systemctl start certbot.timer
        fi
        echo "Automatic certificate renewal is enabled"
        
        # Phase 2: Now update nginx with full HTTPS config including www redirect
        echo "=== Updating nginx with full HTTPS configuration ==="
        sudo tee "${NGINX_SITE}" > /dev/null << 'EOF'
# Redirect www to non-www on HTTP (port 80)
server {
    listen 80;
    listen [::]:80;
    server_name www.bittorrented.com;
    return 301 https://bittorrented.com$request_uri;
}

# Redirect HTTP to HTTPS for main domain (port 80)
server {
    listen 80;
    listen [::]:80;
    server_name bittorrented.com;
    return 301 https://bittorrented.com$request_uri;
}

# Redirect www to non-www on HTTPS (port 443)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.bittorrented.com;

    ssl_certificate /etc/letsencrypt/live/bittorrented.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bittorrented.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://bittorrented.com$request_uri;
}

# Main HTTPS server (port 443)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name bittorrented.com;

    ssl_certificate /etc/letsencrypt/live/bittorrented.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bittorrented.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_buffering off;
    }

    location /api/health {
        proxy_pass http://127.0.0.1:3000/api/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    client_max_body_size 100M;
}
EOF
        
        # Test and reload nginx with new config
        echo "=== Testing updated nginx configuration ==="
        sudo nginx -t
        sudo systemctl reload nginx
        echo "=== Full HTTPS nginx configuration applied! ==="
    else
        echo "WARNING: Domain ${DOMAIN} does not resolve to this server"
        echo "  Server IP: ${SERVER_IP}"
        echo "  Domain IP: ${DOMAIN_IP}"
        echo "  Skipping SSL certificate request"
        echo "  To force SSL setup, run: FORCE_SSL=1 bash scripts/setup-server.sh"
        echo ""
    fi
else
    echo "=== SSL certificate already exists ==="
    # Check certificate expiry
    EXPIRY=$(sudo openssl x509 -enddate -noout -in "${SSL_CERT}" 2>/dev/null | cut -d= -f2)
    echo "  Certificate expires: ${EXPIRY}"
    
    # Ensure full HTTPS config is in place (in case script was interrupted before)
    if ! grep -q "listen 443 ssl" "${NGINX_SITE}" 2>/dev/null; then
        echo "=== Updating nginx with full HTTPS configuration ==="
        sudo tee "${NGINX_SITE}" > /dev/null << 'EOF'
# Redirect www to non-www on HTTP (port 80)
server {
    listen 80;
    listen [::]:80;
    server_name www.bittorrented.com;
    return 301 https://bittorrented.com$request_uri;
}

# Redirect HTTP to HTTPS for main domain (port 80)
server {
    listen 80;
    listen [::]:80;
    server_name bittorrented.com;
    return 301 https://bittorrented.com$request_uri;
}

# Redirect www to non-www on HTTPS (port 443)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.bittorrented.com;

    ssl_certificate /etc/letsencrypt/live/bittorrented.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bittorrented.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://bittorrented.com$request_uri;
}

# Main HTTPS server (port 443)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name bittorrented.com;

    ssl_certificate /etc/letsencrypt/live/bittorrented.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bittorrented.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_buffering off;
    }

    location /api/health {
        proxy_pass http://127.0.0.1:3000/api/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    client_max_body_size 100M;
}
EOF
        sudo nginx -t
        sudo systemctl reload nginx
        echo "=== Full HTTPS nginx configuration applied! ==="
    fi
fi

# Create log files with proper permissions
LOG_FILE="/var/log/${DOMAIN}.log"
ERROR_LOG_FILE="/var/log/${DOMAIN}.error.log"
echo "=== Setting up log files ==="
sudo touch "${LOG_FILE}" "${ERROR_LOG_FILE}"
sudo chown ${VPS_USER}:${VPS_USER} "${LOG_FILE}" "${ERROR_LOG_FILE}"
sudo chmod 644 "${LOG_FILE}" "${ERROR_LOG_FILE}"

# Create/update systemd service
echo "=== Updating systemd service ==="
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=BitTorrented Media Streamer
After=network.target

[Service]
Type=simple
User=${VPS_USER}
WorkingDirectory=${DEPLOY_PATH}
ExecStart=${PNPM_HOME}/pnpm start
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PATH=${PNPM_HOME}:/usr/local/bin:/usr/bin:/bin

# Log to files instead of journald
StandardOutput=append:${LOG_FILE}
StandardError=append:${ERROR_LOG_FILE}

# Increase file descriptor limits for torrents
LimitNOFILE=65535

# Allow binding to privileged ports if needed
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

# Set up log rotation for the domain logs
echo "=== Setting up log rotation ==="
sudo tee /etc/logrotate.d/${DOMAIN} > /dev/null << EOF
${LOG_FILE} ${ERROR_LOG_FILE} {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 644 ${VPS_USER} ${VPS_USER}
    postrotate
        systemctl reload ${SERVICE_NAME} > /dev/null 2>&1 || true
    endscript
}
EOF

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME} 2>/dev/null || true

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Installed versions:"
echo "  Node.js: $(node --version 2>/dev/null || echo 'not found')"
echo "  pnpm: $(pnpm --version 2>/dev/null || echo 'not found')"
echo "  ffmpeg: $(ffmpeg -version 2>/dev/null | head -1 || echo 'not found')"
echo "  nginx: $(nginx -v 2>&1 | head -1 || echo 'not found')"
echo ""
echo "Configuration:"
echo "  Service: ${SERVICE_NAME}"
echo "  Deploy path: ${DEPLOY_PATH}"
echo "  Nginx site: /etc/nginx/sites-available/${DOMAIN}"
echo "  Domain: https://${DOMAIN} and https://www.${DOMAIN}"
if [ -f "${SSL_CERT}" ]; then
    echo "  SSL: Enabled (auto-renewal configured)"
else
    echo "  SSL: Not configured (domain DNS may not be pointing to this server)"
fi
echo ""
echo "Log files:"
echo "  Stdout:  ${LOG_FILE}"
echo "  Stderr:  ${ERROR_LOG_FILE}"
echo ""
echo "Service commands:"
echo "  Start:   sudo systemctl start ${SERVICE_NAME}"
echo "  Stop:    sudo systemctl stop ${SERVICE_NAME}"
echo "  Restart: sudo systemctl restart ${SERVICE_NAME}"
echo "  Status:  sudo systemctl status ${SERVICE_NAME}"
echo "  Logs:    tail -f ${LOG_FILE}"
echo "  Errors:  tail -f ${ERROR_LOG_FILE}"

