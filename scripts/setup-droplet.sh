#!/bin/bash
# Idempotent setup script for DigitalOcean Droplet
# Safe to run multiple times - only installs/configures what's missing
#
# Run manually: bash scripts/setup-droplet.sh
# Or via GitHub Actions (runs automatically on deploy)

set -e

# Configuration
DOMAIN="bittorrented.com"
REPO="media-streamer"
DEPLOY_PATH="/home/ubuntu/www/${DOMAIN}/${REPO}"
SERVICE_NAME="bittorrented"
NODE_VERSION="22"  # LTS version
PNPM_HOME="${HOME}/.local/share/pnpm"

echo "=== BitTorrented Droplet Setup (Idempotent) ==="
echo "Deploy path: ${DEPLOY_PATH}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

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
for pkg in curl git build-essential ffmpeg rsync ufw fail2ban; do
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
sudo ufw allow ssh 2>/dev/null || true
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

# Configure fail2ban (only if config doesn't exist)
if [ ! -f /etc/fail2ban/jail.local ]; then
    echo "=== Configuring fail2ban ==="
    sudo tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[DEFAULT]
bantime = 600
findtime = 600
maxretry = 10

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 10
bantime = 600
EOF
    sudo systemctl restart fail2ban
else
    echo "=== fail2ban already configured ==="
fi

# Create/update systemd service
echo "=== Updating systemd service ==="
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=BitTorrented Media Streamer
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${DEPLOY_PATH}
ExecStart=${PNPM_HOME}/pnpm start
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PATH=${PNPM_HOME}:/usr/local/bin:/usr/bin:/bin

# Increase file descriptor limits for torrents
LimitNOFILE=65535

# Allow binding to privileged ports if needed
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
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
echo ""
echo "Service: ${SERVICE_NAME}"
echo "Deploy path: ${DEPLOY_PATH}"
