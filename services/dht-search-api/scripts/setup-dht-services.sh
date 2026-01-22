#!/bin/bash
#
# DHT Crawler Services Setup Script (Idempotent)
# This script sets up the Bitmagnet DHT crawler and DHT Search API services
#
# Usage: sudo bash setup-dht-services.sh
#
# Requirements:
# - Ubuntu 22.04+ or Debian 12+
# - Root or sudo access
# - Node.js and pnpm already installed (via main setup-server.sh)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BITMAGNET_VERSION="${BITMAGNET_VERSION:-v0.9.5}"
BITMAGNET_DIR="/opt/bitmagnet"
DHT_API_DIR="/opt/dht-api"
# Use the user who invoked sudo, or fall back to ubuntu
SERVICE_USER="${SUDO_USER:-ubuntu}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Install system dependencies (only if missing)
install_dependencies() {
    log_info "Checking system dependencies..."

    PACKAGES_TO_INSTALL=""
    for pkg in curl wget unzip git ca-certificates; do
        if ! dpkg -l | grep -q "^ii  $pkg "; then
            PACKAGES_TO_INSTALL="$PACKAGES_TO_INSTALL $pkg"
        fi
    done

    if [ -n "$PACKAGES_TO_INSTALL" ]; then
        log_info "Installing:$PACKAGES_TO_INSTALL"
        apt-get update
        apt-get install -y $PACKAGES_TO_INSTALL
    else
        log_info "All dependencies already installed"
    fi

    # Verify Node.js and pnpm are available
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please run setup-server.sh first."
        exit 1
    fi
    log_info "Node.js version: $(node --version)"

    if ! command -v pnpm &> /dev/null; then
        log_warn "pnpm not found in PATH, checking user installation..."
        PNPM_PATH="/home/${SERVICE_USER}/.local/share/pnpm/pnpm"
        if [ -f "$PNPM_PATH" ]; then
            log_info "Found pnpm at $PNPM_PATH"
        else
            log_error "pnpm is not installed. Please run setup-server.sh first."
            exit 1
        fi
    else
        log_info "pnpm version: $(pnpm --version)"
    fi
}

# Download and install Bitmagnet
install_bitmagnet() {
    if [ -f "${BITMAGNET_DIR}/bitmagnet" ]; then
        log_info "Bitmagnet already installed at ${BITMAGNET_DIR}/bitmagnet"
        return
    fi

    log_info "Installing Bitmagnet ${BITMAGNET_VERSION}..."

    mkdir -p "$BITMAGNET_DIR"

    # Determine architecture
    ARCH=$(uname -m)
    case $ARCH in
        x86_64) ARCH="amd64" ;;
        aarch64) ARCH="arm64" ;;
        *) log_error "Unsupported architecture: $ARCH"; exit 1 ;;
    esac

    # Download Bitmagnet
    DOWNLOAD_URL="https://github.com/bitmagnet-io/bitmagnet/releases/download/${BITMAGNET_VERSION}/bitmagnet_Linux_${ARCH}.tar.gz"
    log_info "Downloading from: $DOWNLOAD_URL"

    cd "$BITMAGNET_DIR"
    wget -q "$DOWNLOAD_URL" -O bitmagnet.tar.gz
    tar -xzf bitmagnet.tar.gz
    rm bitmagnet.tar.gz
    chmod +x bitmagnet
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "$BITMAGNET_DIR"

    log_info "Bitmagnet installed to $BITMAGNET_DIR/bitmagnet"
}

# Setup Bitmagnet configuration
setup_bitmagnet_config() {
    if [ -f "${BITMAGNET_DIR}/.env" ]; then
        log_info "Bitmagnet config already exists at ${BITMAGNET_DIR}/.env"
        return
    fi

    log_info "Creating Bitmagnet configuration template..."

    cat > "${BITMAGNET_DIR}/.env" << 'EOF'
# Bitmagnet Configuration
# See: https://bitmagnet.io/setup/configuration.html

# Database (Supabase PostgreSQL)
POSTGRES_HOST=db.xxx.supabase.co
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
POSTGRES_DATABASE=postgres

# DHT Crawler Settings
DHT_CRAWLER_SAVE_FILES_THRESHOLD=0
DHT_CRAWLER_SAVE_PIECES=false
DHT_CRAWLER_SCALING_FACTOR=10

# Worker Settings
QUEUE_CONCURRENCY=10
EOF

    chown "${SERVICE_USER}:${SERVICE_USER}" "${BITMAGNET_DIR}/.env"
    chmod 600 "${BITMAGNET_DIR}/.env"
    log_warn "Created ${BITMAGNET_DIR}/.env - please edit with your Supabase credentials"
}

# Setup DHT Search API
setup_dht_api() {
    if [ -f "${DHT_API_DIR}/package.json" ]; then
        log_info "DHT Search API already installed at ${DHT_API_DIR}"
        # Update if source is newer
        if [ -f "${SERVICE_DIR}/package.json" ]; then
            log_info "Updating DHT Search API from source..."
            cp -r "${SERVICE_DIR}/src" "${DHT_API_DIR}/"
            cp "${SERVICE_DIR}/package.json" "${DHT_API_DIR}/"
            cp "${SERVICE_DIR}/tsconfig.json" "${DHT_API_DIR}/"
            mkdir -p "${DHT_API_DIR}/scripts"
            cp -r "${SERVICE_DIR}/scripts/"*.ts "${DHT_API_DIR}/scripts/" 2>/dev/null || true
            chown -R "${SERVICE_USER}:${SERVICE_USER}" "${DHT_API_DIR}"
        fi
        return
    fi

    log_info "Installing DHT Search API..."

    mkdir -p "$DHT_API_DIR"

    # Copy API source files
    if [ -d "${SERVICE_DIR}/src" ]; then
        cp -r "${SERVICE_DIR}/src" "${DHT_API_DIR}/"
        cp "${SERVICE_DIR}/package.json" "${DHT_API_DIR}/"
        cp "${SERVICE_DIR}/tsconfig.json" "${DHT_API_DIR}/"

        # Copy scripts
        mkdir -p "${DHT_API_DIR}/scripts"
        cp -r "${SERVICE_DIR}/scripts/"*.ts "${DHT_API_DIR}/scripts/" 2>/dev/null || true
    else
        log_error "DHT Search API source not found at ${SERVICE_DIR}"
        exit 1
    fi

    # Create .env file
    if [ ! -f "${DHT_API_DIR}/.env" ]; then
        cat > "${DHT_API_DIR}/.env" << 'EOF'
# DHT Search API Configuration

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Redis (optional)
REDIS_URL=redis://localhost:6379

# API Settings
PORT=3333
NODE_ENV=production
LOG_LEVEL=info

# API Key Salt (generate with: openssl rand -hex 16)
API_KEY_SALT=change-this-to-random-string
EOF
        chmod 600 "${DHT_API_DIR}/.env"
        log_warn "Created ${DHT_API_DIR}/.env - please edit with your credentials"
    fi

    # Install dependencies as the service user
    cd "${DHT_API_DIR}"
    PNPM_HOME="/home/${SERVICE_USER}/.local/share/pnpm"
    if [ -d "$PNPM_HOME" ]; then
        sudo -u "${SERVICE_USER}" bash -c "export PATH=\"${PNPM_HOME}:\$PATH\" && cd ${DHT_API_DIR} && pnpm install"
    else
        # Fall back to system pnpm
        sudo -u "${SERVICE_USER}" pnpm install
    fi

    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${DHT_API_DIR}"
    log_info "DHT Search API installed to $DHT_API_DIR"
}

# Install systemd services (generated dynamically to use correct user)
install_systemd_services() {
    log_info "Installing systemd services..."

    PNPM_HOME="/home/${SERVICE_USER}/.local/share/pnpm"

    # Create log files with correct permissions
    touch /var/log/bitmagnet.log /var/log/bitmagnet.error.log
    touch /var/log/dht-api.log /var/log/dht-api.error.log
    chown "${SERVICE_USER}:${SERVICE_USER}" /var/log/bitmagnet.* /var/log/dht-api.*

    # Create Bitmagnet systemd service
    cat > /etc/systemd/system/bitmagnet.service << EOF
[Unit]
Description=Bitmagnet DHT Crawler
Documentation=https://bitmagnet.io
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${BITMAGNET_DIR}
EnvironmentFile=${BITMAGNET_DIR}/.env
ExecStart=${BITMAGNET_DIR}/bitmagnet worker run --keys=queue_server --keys=dht_crawler
Restart=always
RestartSec=10

StandardOutput=append:/var/log/bitmagnet.log
StandardError=append:/var/log/bitmagnet.error.log

LimitNOFILE=65535
MemoryMax=2G

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
ReadWritePaths=${BITMAGNET_DIR} /var/log

[Install]
WantedBy=multi-user.target
EOF

    # Create DHT API systemd service
    cat > /etc/systemd/system/dht-api.service << EOF
[Unit]
Description=DHT Search API Server
Documentation=https://github.com/profullstack/music-torrent
After=network.target bitmagnet.service

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${DHT_API_DIR}
EnvironmentFile=${DHT_API_DIR}/.env
ExecStart=/bin/bash -c 'export PATH="${PNPM_HOME}:\$PATH" && pnpm start'
Environment=PATH=${PNPM_HOME}:/usr/local/bin:/usr/bin:/bin
Restart=always
RestartSec=5

StandardOutput=append:/var/log/dht-api.log
StandardError=append:/var/log/dht-api.error.log

LimitNOFILE=65535
MemoryMax=512M

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
ReadWritePaths=${DHT_API_DIR} /var/log

[Install]
WantedBy=multi-user.target
EOF

    # Create logrotate configs
    cat > /etc/logrotate.d/bitmagnet << EOF
/var/log/bitmagnet.log /var/log/bitmagnet.error.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 644 ${SERVICE_USER} ${SERVICE_USER}
    postrotate
        systemctl reload bitmagnet > /dev/null 2>&1 || true
    endscript
}
EOF

    cat > /etc/logrotate.d/dht-api << EOF
/var/log/dht-api.log /var/log/dht-api.error.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 ${SERVICE_USER} ${SERVICE_USER}
    postrotate
        systemctl reload dht-api > /dev/null 2>&1 || true
    endscript
}
EOF

    # Reload systemd and enable services
    systemctl daemon-reload
    systemctl enable bitmagnet 2>/dev/null || true
    systemctl enable dht-api 2>/dev/null || true

    log_info "systemd services installed and enabled"
}

# Configure firewall
configure_firewall() {
    log_info "Configuring firewall..."

    if command -v ufw &> /dev/null; then
        # DHT uses UDP
        ufw allow 3334/udp comment "Bitmagnet DHT" 2>/dev/null || true
        # API port (internal, usually behind reverse proxy)
        ufw allow 3333/tcp comment "DHT Search API" 2>/dev/null || true
        log_info "UFW rules added"
    else
        log_warn "UFW not found - please configure your firewall manually"
        log_warn "Required ports: 3334/udp (DHT), 3333/tcp (API)"
    fi
}

# Print status and next steps
print_status() {
    echo ""
    echo "============================================"
    echo "       DHT Services Setup Complete         "
    echo "============================================"
    echo ""
    echo "Installed services:"
    echo "  - Bitmagnet DHT Crawler: $BITMAGNET_DIR"
    echo "  - DHT Search API:        $DHT_API_DIR"
    echo "  - Running as user:       $SERVICE_USER"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Configure Bitmagnet environment:"
    echo "   sudo nano $BITMAGNET_DIR/.env"
    echo ""
    echo "2. Configure DHT API environment:"
    echo "   sudo nano $DHT_API_DIR/.env"
    echo ""
    echo "3. Run database migrations (from main project):"
    echo "   supabase db push --linked --include-all"
    echo ""
    echo "4. Start the services:"
    echo "   sudo systemctl start bitmagnet"
    echo "   sudo systemctl start dht-api"
    echo ""
    echo "5. Check service status:"
    echo "   sudo systemctl status bitmagnet"
    echo "   sudo systemctl status dht-api"
    echo ""
    echo "6. View logs:"
    echo "   tail -f /var/log/bitmagnet.log"
    echo "   tail -f /var/log/dht-api.log"
    echo ""
    echo "7. Generate an API key:"
    echo "   cd $DHT_API_DIR && pnpm generate-key pro \"My App\""
    echo ""
    echo "API Endpoints (after starting):"
    echo "  - Health:  http://localhost:3333/health"
    echo "  - Search:  http://localhost:3333/v1/search?q=ubuntu"
    echo "  - Stats:   http://localhost:3333/v1/stats"
    echo ""
}

# Main
main() {
    log_info "Starting DHT Services Setup (user: ${SERVICE_USER})..."

    check_root
    install_dependencies
    install_bitmagnet
    setup_bitmagnet_config
    setup_dht_api
    install_systemd_services
    configure_firewall
    print_status
}

main "$@"
