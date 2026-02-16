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

# Install Docker if not present (for Coturn STUN/TURN server)
if ! command_exists docker; then
    echo "=== Installing Docker ==="
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker ${VPS_USER}
    sudo systemctl enable docker
    sudo systemctl start docker
    echo "✓ Docker installed"
else
    echo "=== Docker $(docker --version 2>/dev/null | head -1 || echo 'installed') already installed ==="
fi

# Install Docker Compose plugin if not present
if ! docker compose version >/dev/null 2>&1; then
    echo "=== Installing Docker Compose plugin ==="
    sudo apt-get install -y docker-compose-plugin
    echo "✓ Docker Compose plugin installed"
else
    echo "=== Docker Compose $(docker compose version 2>/dev/null | head -1 || echo 'installed') already installed ==="
fi

# Configure and start Coturn STUN/TURN server (for WebRTC NAT traversal)
echo "=== Configuring Coturn STUN/TURN server ==="
COTURN_DIR="${PROJECT_ROOT}/coturn"
COTURN_CONFIG="${COTURN_DIR}/turnserver.conf"

# Get server's public IP for TURN external-ip
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "")

# Create coturn directory if it doesn't exist
if [ ! -d "${COTURN_DIR}" ]; then
    mkdir -p "${COTURN_DIR}"
    echo "  Created ${COTURN_DIR} directory"
fi

# Create turnserver.conf if it doesn't exist
if [ ! -f "${COTURN_CONFIG}" ]; then
    echo "  Creating Coturn configuration file..."
    
    # Generate a random secret if TURN_SECRET is not set
    TURN_SECRET_VALUE="${TURN_SECRET:-$(openssl rand -hex 32)}"
    TURN_REALM_VALUE="${TURN_REALM:-bittorrented.com}"
    
    cat > "${COTURN_CONFIG}" << COTURN_EOF
# Coturn TURN/STUN Server Configuration
# For WebTorrent P2P streaming NAT traversal
# Auto-generated by setup-server.sh

# Network settings
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0

# External IP - server's public IP
external-ip=${SERVER_IP}

# Realm and server name
realm=${TURN_REALM_VALUE}
server-name=turn.${TURN_REALM_VALUE}

# Authentication using shared secret (time-limited credentials)
# This is more secure than static username/password
# The app generates time-limited credentials using HMAC-SHA1
use-auth-secret
static-auth-secret=${TURN_SECRET_VALUE}

# Disable static user accounts (use only time-limited credentials)
no-cli

# Performance and limits
# Total bandwidth quota in KB/s (0 = unlimited)
# 6TB/month = ~2.3 GB/day = ~27 MB/s average
# Set to 50000 KB/s (50 MB/s) to allow bursts while staying under limit
total-quota=50000
# Per-session bandwidth limit in bytes/sec (0 = unlimited)
# Limit each session to 5 MB/s to prevent single users from hogging bandwidth
bps-capacity=5000000
# Maximum allocations per user
user-quota=100
# Stale nonce lifetime in seconds
stale-nonce=600
# Maximum number of simultaneous TURN allocations
# Helps prevent resource exhaustion
max-allocate-lifetime=3600

# Relay settings
# Min/max ports for media relay (UDP)
min-port=49152
max-port=65535

# Enable fingerprinting for better NAT traversal
fingerprint

# Enable long-term credential mechanism
lt-cred-mech

# Logging
# Log to stdout for Docker
log-file=stdout

# Security settings
# Disable multicast peers
no-multicast-peers
# Disable TCP relay (WebRTC uses UDP)
no-tcp-relay
# Deny peers on loopback
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=::1

# Allow only UDP and TCP for client connections
# WebRTC primarily uses UDP
no-tlsv1
no-tlsv1_1

# Mobility (for mobile clients that change networks)
mobility

# Process settings
proc-user=nobody
proc-group=nogroup
COTURN_EOF
    
    echo "✓ Created Coturn configuration at ${COTURN_CONFIG}"
    echo "  TURN_SECRET: ${TURN_SECRET_VALUE}"
    echo "  TURN_REALM: ${TURN_REALM_VALUE}"
    echo "  External IP: ${SERVER_IP}"
    
    # Automatically add TURN variables to .env file
    ENV_FILE="${PROJECT_ROOT}/.env"
    echo ""
    echo "=== Updating .env file with TURN configuration ==="
    
    # Create .env from .env.example if it doesn't exist
    if [ ! -f "${ENV_FILE}" ] && [ -f "${PROJECT_ROOT}/.env.example" ]; then
        cp "${PROJECT_ROOT}/.env.example" "${ENV_FILE}"
        echo "  Created .env from .env.example"
    fi
    
    # Add or update TURN variables in .env
    if [ -f "${ENV_FILE}" ]; then
        # Function to add or update a variable in .env
        update_env_var() {
            local key="$1"
            local value="$2"
            if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
                # Update existing variable
                sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
                echo "  Updated ${key} in .env"
            else
                # Add new variable
                echo "${key}=${value}" >> "${ENV_FILE}"
                echo "  Added ${key} to .env"
            fi
        }
        
        update_env_var "TURN_SECRET" "${TURN_SECRET_VALUE}"
        update_env_var "TURN_REALM" "${TURN_REALM_VALUE}"
        update_env_var "TURN_EXTERNAL_IP" "${SERVER_IP}"
        update_env_var "NEXT_PUBLIC_TURN_SERVER_URL" "turn:${TURN_REALM_VALUE}:3478"
        
        echo "✓ TURN configuration added to .env"
    else
        echo "  WARNING: .env file not found. Please create it and add:"
        echo "    TURN_SECRET=${TURN_SECRET_VALUE}"
        echo "    TURN_REALM=${TURN_REALM_VALUE}"
        echo "    TURN_EXTERNAL_IP=${SERVER_IP}"
        echo "    NEXT_PUBLIC_TURN_SERVER_URL=turn:${TURN_REALM_VALUE}:3478"
    fi
else
    echo "  Coturn config already exists at ${COTURN_CONFIG}"
    
    # Update external-ip if not already set
    if [ -n "${SERVER_IP}" ]; then
        if ! grep -q "^external-ip=" "${COTURN_CONFIG}"; then
            echo "external-ip=${SERVER_IP}" >> "${COTURN_CONFIG}"
            echo "  Added external-ip=${SERVER_IP} to Coturn config"
        fi
    fi
fi

# Start Coturn via Docker Compose
cd "${PROJECT_ROOT}"
if docker compose ps coturn 2>/dev/null | grep -q "running"; then
    echo "✓ Coturn is already running"
else
    echo "  Starting Coturn container..."
    docker compose up -d coturn
    sleep 2
    if docker compose ps coturn 2>/dev/null | grep -q "running"; then
        echo "✓ Coturn started successfully"
    else
        echo "WARNING: Coturn failed to start. Check logs with: docker compose logs coturn"
    fi
fi

# TURN server health check
echo "=== Checking TURN server health ==="
if [ -n "${SERVER_IP}" ]; then
    # Test STUN binding request using netcat (basic connectivity check)
    if command_exists nc; then
        if nc -z -u -w 2 ${SERVER_IP} 3478 2>/dev/null; then
            echo "✓ TURN server is responding on UDP port 3478"
        elif nc -z -w 2 ${SERVER_IP} 3478 2>/dev/null; then
            echo "✓ TURN server is responding on TCP port 3478"
        else
            echo "  TURN server port check inconclusive (may still be working)"
        fi
    fi
    
    # Check if turnutils_uclient is available for proper STUN test
    if command_exists turnutils_uclient; then
        echo "  Running STUN binding test..."
        if turnutils_uclient -T -p 3478 ${SERVER_IP} 2>/dev/null | grep -q "success"; then
            echo "✓ STUN binding test passed"
        else
            echo "  STUN binding test inconclusive"
        fi
    fi
    
    # Check Docker logs for any errors
    COTURN_ERRORS=$(docker compose logs coturn 2>/dev/null | tail -20 | grep -i "error\|failed\|cannot" || true)
    if [ -n "${COTURN_ERRORS}" ]; then
        echo "  WARNING: Found potential errors in Coturn logs:"
        echo "${COTURN_ERRORS}" | head -5
    else
        echo "✓ No errors found in Coturn logs"
    fi
    
    echo ""
    echo "  TURN server endpoints:"
    echo "    STUN: stun:${SERVER_IP}:3478"
    echo "    TURN: turn:${SERVER_IP}:3478"
    echo "    TURNS: turns:${SERVER_IP}:5349"
else
    echo "  Skipping health check (server IP not detected)"
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

# Install reliq (HTML parser required by torge)
if ! command_exists reliq; then
    echo "=== Installing reliq (HTML parser) ==="
    RELIQ_TMP=$(mktemp -d)
    cd "$RELIQ_TMP"
    git clone https://github.com/TUVIMEN/reliq.git
    cd reliq
    make
    sudo make install
    cd /
    rm -rf "$RELIQ_TMP"
    echo "✓ reliq installed"
else
    echo "=== reliq already installed ==="
fi

# Install torge (torrent search CLI)
if ! command_exists torge; then
    echo "=== Installing torge (torrent search CLI) ==="
    TORGE_TMP=$(mktemp -d)
    cd "$TORGE_TMP"
    git clone https://github.com/TUVIMEN/torge.git
    cd torge
    sudo install -m 755 torge /usr/bin/torge
    cd /
    rm -rf "$TORGE_TMP"
    echo "✓ torge installed"
else
    echo "=== torge already installed ==="
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
# Coturn STUN/TURN server ports for WebRTC NAT traversal
sudo ufw allow 3478/tcp 2>/dev/null || true   # STUN/TURN
sudo ufw allow 3478/udp 2>/dev/null || true   # STUN/TURN
sudo ufw allow 5349/tcp 2>/dev/null || true   # TURN over TLS
sudo ufw allow 49152:65535/udp 2>/dev/null || true  # TURN media relay range

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
    rotate 2
    compress
    delaycompress
    missingok
    notifempty
    create 644 ${VPS_USER} ${VPS_USER}
    copytruncate
}
EOF

# Create/update IPTV Cache Worker systemd service
IPTV_WORKER_SERVICE="${SERVICE_NAME}-iptv-worker"
IPTV_WORKER_LOG="/var/log/${SERVICE_NAME}-iptv-worker.log"
IPTV_WORKER_ERROR_LOG="/var/log/${SERVICE_NAME}-iptv-worker.error.log"

echo "=== Setting up IPTV Cache Worker service ==="
sudo touch "${IPTV_WORKER_LOG}" "${IPTV_WORKER_ERROR_LOG}"
sudo chown ${VPS_USER}:${VPS_USER} "${IPTV_WORKER_LOG}" "${IPTV_WORKER_ERROR_LOG}"
sudo chmod 644 "${IPTV_WORKER_LOG}" "${IPTV_WORKER_ERROR_LOG}"

sudo tee /etc/systemd/system/${IPTV_WORKER_SERVICE}.service > /dev/null << EOF
[Unit]
Description=BitTorrented IPTV Cache Worker
After=network.target redis-server.service

[Service]
Type=simple
User=${VPS_USER}
WorkingDirectory=${DEPLOY_PATH}
# Use bash to source .env file properly (handles quotes and complex values)
ExecStart=/bin/bash -c 'set -a; source ${DEPLOY_PATH}/.env; set +a; exec ${PNPM_HOME}/pnpm iptv-worker'
Restart=on-failure
RestartSec=30
Environment=NODE_ENV=production
Environment=PATH=${PNPM_HOME}:/usr/local/bin:/usr/bin:/bin

# Log to files
StandardOutput=append:${IPTV_WORKER_LOG}
StandardError=append:${IPTV_WORKER_ERROR_LOG}

# Increase file descriptor limits
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

# Add IPTV worker logs to logrotate
echo "=== Setting up IPTV worker log rotation ==="
sudo tee /etc/logrotate.d/${IPTV_WORKER_SERVICE} > /dev/null << EOF
${IPTV_WORKER_LOG} ${IPTV_WORKER_ERROR_LOG} {
    daily
    rotate 2
    compress
    delaycompress
    missingok
    notifempty
    create 644 ${VPS_USER} ${VPS_USER}
    copytruncate
}
EOF

# Create/update Podcast Notifier Worker systemd service
PODCAST_WORKER_SERVICE="${SERVICE_NAME}-podcast-worker"
PODCAST_WORKER_LOG="/var/log/${SERVICE_NAME}-podcast-worker.log"
PODCAST_WORKER_ERROR_LOG="/var/log/${SERVICE_NAME}-podcast-worker.error.log"

echo "=== Setting up Podcast Notifier Worker service ==="
sudo touch "${PODCAST_WORKER_LOG}" "${PODCAST_WORKER_ERROR_LOG}"
sudo chown ${VPS_USER}:${VPS_USER} "${PODCAST_WORKER_LOG}" "${PODCAST_WORKER_ERROR_LOG}"
sudo chmod 644 "${PODCAST_WORKER_LOG}" "${PODCAST_WORKER_ERROR_LOG}"

sudo tee /etc/systemd/system/${PODCAST_WORKER_SERVICE}.service > /dev/null << EOF
[Unit]
Description=BitTorrented Podcast Notifier Worker
After=network.target

[Service]
Type=simple
User=${VPS_USER}
WorkingDirectory=${DEPLOY_PATH}
# Use bash to source .env file properly (handles quotes and complex values)
ExecStart=/bin/bash -c 'set -a; source ${DEPLOY_PATH}/.env; set +a; exec ${PNPM_HOME}/pnpm podcast-worker'
Restart=on-failure
RestartSec=30
Environment=NODE_ENV=production
Environment=PATH=${PNPM_HOME}:/usr/local/bin:/usr/bin:/bin

# Log to files
StandardOutput=append:${PODCAST_WORKER_LOG}
StandardError=append:${PODCAST_WORKER_ERROR_LOG}

# Increase file descriptor limits
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

# Add Podcast worker logs to logrotate
echo "=== Setting up Podcast worker log rotation ==="
sudo tee /etc/logrotate.d/${PODCAST_WORKER_SERVICE} > /dev/null << EOF
${PODCAST_WORKER_LOG} ${PODCAST_WORKER_ERROR_LOG} {
    daily
    rotate 2
    compress
    delaycompress
    missingok
    notifempty
    create 644 ${VPS_USER} ${VPS_USER}
    copytruncate
}
EOF

# Cap systemd journal size (idempotent - overwrites config)
echo "=== Configuring systemd journal size limit ==="
sudo mkdir -p /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/size-limit.conf > /dev/null << EOF
[Journal]
SystemMaxUse=200M
MaxRetentionSec=2day
EOF
sudo systemctl restart systemd-journald 2>/dev/null || true
echo "✓ Journal capped at 200M / 2 days"

# ============================================
# DHT CRAWLER SERVICES (Bitmagnet + DHT API)
# ============================================
# Skip if DHT_ENABLED is explicitly set to false
if [ "${DHT_ENABLED:-true}" != "false" ]; then
    echo ""
    echo "=== Setting up DHT Crawler Services ==="

    # Call the dedicated DHT setup script
    DHT_SETUP_SCRIPT="${PROJECT_ROOT}/services/dht-search-api/scripts/setup-dht-services.sh"
    if [ -f "${DHT_SETUP_SCRIPT}" ]; then
        echo "  Running: ${DHT_SETUP_SCRIPT}"
        sudo bash "${DHT_SETUP_SCRIPT}"
    else
        echo "  WARNING: DHT setup script not found at ${DHT_SETUP_SCRIPT}"
        echo "  Skipping DHT services installation"
    fi
else
    echo ""
    echo "=== Skipping DHT Crawler Services (DHT_ENABLED=false) ==="
fi

# Reload systemd and enable services
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME} 2>/dev/null || true
sudo systemctl enable ${IPTV_WORKER_SERVICE} 2>/dev/null || true
sudo systemctl enable ${PODCAST_WORKER_SERVICE} 2>/dev/null || true

# Set up IMDB dataset daily update cron job (runs at midnight UTC)
echo "=== Setting up IMDB dataset daily update cron job ==="
IMDB_UPDATE_SCRIPT="${PROJECT_ROOT}/scripts/update-imdb-daily.sh"
IMDB_CRON_JOB="0 0 * * * ${IMDB_UPDATE_SCRIPT} >> /var/log/imdb-update.log 2>&1"
if [ -f "${IMDB_UPDATE_SCRIPT}" ]; then
    chmod +x "${IMDB_UPDATE_SCRIPT}"
    chmod +x "${PROJECT_ROOT}/scripts/import-imdb.sh" 2>/dev/null || true
    sudo touch /var/log/imdb-update.log
    sudo chown ${VPS_USER}:${VPS_USER} /var/log/imdb-update.log
    if crontab -l 2>/dev/null | grep -q "update-imdb-daily"; then
        echo "  IMDB update cron job already exists"
    else
        (crontab -l 2>/dev/null || true; echo "${IMDB_CRON_JOB}") | crontab -
        echo "✓ Added cron job: IMDB dataset update at midnight daily"
    fi
else
    echo "  WARNING: ${IMDB_UPDATE_SCRIPT} not found, skipping IMDB cron setup"
fi

# Set up cron job to clean webtorrent temp directory at midnight
WEBTORRENT_TMP_DIR="/home/${VPS_USER}/tmp/webtorrent"
CRON_JOB="0 0 * * * rm -rf ${WEBTORRENT_TMP_DIR}/* >/dev/null 2>&1"
echo "=== Setting up webtorrent temp cleanup cron job ==="

# Create the webtorrent tmp directory if it doesn't exist
if [ ! -d "${WEBTORRENT_TMP_DIR}" ]; then
    mkdir -p "${WEBTORRENT_TMP_DIR}"
    echo "  Created ${WEBTORRENT_TMP_DIR}"
fi

# Check if the cron job already exists for this user
if crontab -l 2>/dev/null | grep -q "rm -rf ${WEBTORRENT_TMP_DIR}"; then
    echo "  Cron job for webtorrent cleanup already exists"
else
    # Add the cron job
    (crontab -l 2>/dev/null || true; echo "${CRON_JOB}") | crontab -
    echo "✓ Added cron job: Clean ${WEBTORRENT_TMP_DIR}/* at midnight daily"
fi

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
echo ""
echo "IPTV Cache Worker:"
echo "  Start:   sudo systemctl start ${IPTV_WORKER_SERVICE}"
echo "  Stop:    sudo systemctl stop ${IPTV_WORKER_SERVICE}"
echo "  Restart: sudo systemctl restart ${IPTV_WORKER_SERVICE}"
echo "  Status:  sudo systemctl status ${IPTV_WORKER_SERVICE}"
echo "  Logs:    tail -f ${IPTV_WORKER_LOG}"
echo "  Errors:  tail -f ${IPTV_WORKER_ERROR_LOG}"
echo ""
echo "Podcast Notifier Worker:"
echo "  Start:   sudo systemctl start ${PODCAST_WORKER_SERVICE}"
echo "  Stop:    sudo systemctl stop ${PODCAST_WORKER_SERVICE}"
echo "  Restart: sudo systemctl restart ${PODCAST_WORKER_SERVICE}"
echo "  Status:  sudo systemctl status ${PODCAST_WORKER_SERVICE}"
echo "  Logs:    tail -f ${PODCAST_WORKER_LOG}"
echo "  Errors:  tail -f ${PODCAST_WORKER_ERROR_LOG}"
echo ""
echo "Scheduled Tasks:"
echo "  WebTorrent temp cleanup: Daily at midnight"
echo "  IMDB dataset update: Daily at midnight (incremental)"
echo "  Directory: ${WEBTORRENT_TMP_DIR}"
echo "  View cron jobs: crontab -l"
echo ""
echo "IMDB Datasets:"
echo "  First import: ./scripts/import-imdb.sh ~/tmp/data"
echo "  Daily update: ./scripts/update-imdb-daily.sh (automatic via cron)"
echo "  Logs: /var/log/imdb-update.log"

# DHT Services output (only if enabled)
if [ "${DHT_ENABLED:-true}" != "false" ]; then
    echo ""
    echo "DHT Crawler Services:"
    echo "  Bitmagnet:"
    echo "    Config:  /opt/bitmagnet/.env"
    echo "    Start:   sudo systemctl start bitmagnet"
    echo "    Status:  sudo systemctl status bitmagnet"
    echo "    Logs:    tail -f /var/log/bitmagnet.log"
    echo ""
    echo "  DHT Search API:"
    echo "    Config:  /opt/dht-api/.env"
    echo "    Start:   sudo systemctl start dht-api"
    echo "    Status:  sudo systemctl status dht-api"
    echo "    Logs:    tail -f /var/log/dht-api.log"
    echo "    Health:  curl http://localhost:3333/health"
    echo ""
    echo "  Generate API key:"
    echo "    cd /opt/dht-api && pnpm generate-key pro \"My App\""
    echo ""
    echo "  Note: Edit .env files before starting DHT services!"
fi

