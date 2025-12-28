#!/bin/bash
# BitTorrented Droplet Setup Script (using systemd)
# 
# USAGE:
# 1. First push this to GitHub: git push origin main
# 2. SSH into your Droplet: ssh root@YOUR_DROPLET_IP
# 3. Run: curl -fsSL https://raw.githubusercontent.com/profullstack/music-torrent/main/scripts/setup-droplet.sh | bash
#
# Or copy/paste this entire script into your Droplet terminal

set -e

echo "=========================================="
echo "BitTorrented Droplet Setup (systemd)"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

# Configuration - EDIT THESE
DOMAIN="bittorrented.com"
GITHUB_REPO="https://github.com/profullstack/music-torrent.git"
APP_DIR="/var/www/bittorrented"
SERVICE_NAME="bittorrented"

echo ""
echo -e "${GREEN}[1/10] Updating system...${NC}"
apt update && apt upgrade -y

echo ""
echo -e "${GREEN}[2/10] Installing Node.js 22...${NC}"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

echo ""
echo -e "${GREEN}[3/10] Installing pnpm...${NC}"
npm install -g pnpm

echo ""
echo -e "${GREEN}[4/10] Installing FFmpeg, Git, Nginx, Certbot...${NC}"
apt install -y ffmpeg git nginx certbot python3-certbot-nginx

echo ""
echo -e "${GREEN}[5/10] Creating app user...${NC}"
# Create a dedicated user for the app (more secure than running as root)
if ! id -u bittorrented &>/dev/null; then
  useradd -r -s /bin/false -d $APP_DIR bittorrented
fi

echo ""
echo -e "${GREEN}[6/10] Cloning repository...${NC}"
mkdir -p $APP_DIR
cd $APP_DIR
if [ -d ".git" ]; then
  echo "Repository already exists, pulling latest..."
  git fetch origin main
  git reset --hard origin/main
else
  git clone $GITHUB_REPO .
fi
chown -R bittorrented:bittorrented $APP_DIR

echo ""
echo -e "${GREEN}[7/10] Creating placeholder .env (GitHub Actions will overwrite)...${NC}"
if [ ! -f .env ]; then
  cat > .env << 'EOF'
# This is a placeholder - GitHub Actions will overwrite this on deploy
# If you need to test manually, add your real values here
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
SUPABASE_SERVICE_ROLE_KEY=placeholder
NODE_ENV=production
PORT=3000
EOF
fi
chown bittorrented:bittorrented .env

echo ""
echo -e "${GREEN}[8/10] Installing dependencies and building...${NC}"
# Run as bittorrented user
sudo -u bittorrented pnpm install
sudo -u bittorrented pnpm build

echo ""
echo -e "${GREEN}[9/10] Creating systemd service...${NC}"
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=BitTorrented - Torrent Streaming Service
Documentation=https://github.com/profullstack/music-torrent
After=network.target

[Service]
Type=simple
User=bittorrented
Group=bittorrented
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Environment
Environment=NODE_ENV=production
Environment=PORT=3000

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

echo ""
echo -e "${GREEN}[10/10] Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/bittorrented << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Streaming timeouts
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
        
        # Large file uploads
        client_max_body_size 100M;
    }
}
EOF

ln -sf /etc/nginx/sites-available/bittorrented /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo ""
echo "=========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Your Droplet IP: $(curl -s ifconfig.me)"
echo ""
echo -e "${YELLOW}SYSTEMD COMMANDS:${NC}"
echo "  systemctl status $SERVICE_NAME    # Check status"
echo "  systemctl restart $SERVICE_NAME   # Restart app"
echo "  systemctl stop $SERVICE_NAME      # Stop app"
echo "  journalctl -u $SERVICE_NAME -f    # View logs (live)"
echo "  journalctl -u $SERVICE_NAME -n 100 # View last 100 lines"
echo ""
echo -e "${YELLOW}NEXT STEPS:${NC}"
echo ""
echo "1. Setup SSL (run this command):"
echo "   certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "2. Trigger a GitHub Actions deploy to write the real .env file:"
echo "   - Go to GitHub → Actions → Deploy to Droplet → Run workflow"
echo "   - Or push a commit to main branch"
echo ""
echo "3. Verify the app is running:"
echo "   systemctl status $SERVICE_NAME"
echo "   curl http://localhost:3000/api/health"
echo ""
echo "4. Check your site:"
echo "   http://$DOMAIN"
echo ""
