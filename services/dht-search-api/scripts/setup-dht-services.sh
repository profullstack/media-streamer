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
BITMAGNET_VERSION="${BITMAGNET_VERSION:-v0.10.0}"
BITMAGNET_DIR="/opt/bitmagnet"
DHT_API_DIR="/opt/dht-api"
# Use the user who invoked sudo, or fall back to ubuntu
SERVICE_USER="${SUDO_USER:-ubuntu}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"
# Find the main project root (go up from services/dht-search-api/scripts)
PROJECT_ROOT="$(dirname "$(dirname "$SERVICE_DIR")")"
MAIN_ENV_FILE="${PROJECT_ROOT}/.env"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Load environment variables from main project .env file
load_main_env() {
    if [ -f "${MAIN_ENV_FILE}" ]; then
        log_info "Loading environment from ${MAIN_ENV_FILE}"
        while IFS='=' read -r key value; do
            # Skip empty lines and comments
            [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
            # Remove leading/trailing whitespace from key
            key=$(echo "$key" | xargs)
            # Skip if key is empty after trimming
            [[ -z "$key" ]] && continue
            # Only export if it's a valid variable name
            if [[ "$key" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
                # Remove surrounding quotes from value if present
                value="${value%\"}"
                value="${value#\"}"
                value="${value%\'}"
                value="${value#\'}"
                export "$key=$value"
            fi
        done < "${MAIN_ENV_FILE}"
    else
        log_warn "Main .env file not found at ${MAIN_ENV_FILE}"
    fi
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

    # Determine architecture (bitmagnet uses x86_64/arm64 in filenames)
    ARCH=$(uname -m)
    case $ARCH in
        x86_64) ARCH="x86_64" ;;
        aarch64) ARCH="arm64" ;;
        *) log_error "Unsupported architecture: $ARCH"; exit 1 ;;
    esac

    # Download Bitmagnet (version without 'v' prefix in filename)
    VERSION_NUM="${BITMAGNET_VERSION#v}"
    DOWNLOAD_URL="https://github.com/bitmagnet-io/bitmagnet/releases/download/${BITMAGNET_VERSION}/bitmagnet_${VERSION_NUM}_linux_${ARCH}.tar.gz"
    log_info "Downloading from: $DOWNLOAD_URL"

    cd "$BITMAGNET_DIR"
    wget -qL "$DOWNLOAD_URL" -O bitmagnet.tar.gz
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

    log_info "Creating Bitmagnet configuration..."

    # Use standard Supabase vars from main .env
    local PG_HOST=""
    local PG_PORT="5432"
    local PG_USER="postgres"
    local PG_PASS="${SUPABASE_DB_PASSWORD:-}"
    local PG_DB="postgres"
    local SCALING="${DHT_CRAWLER_SCALING_FACTOR:-10}"
    local CONCURRENCY="${DHT_QUEUE_CONCURRENCY:-10}"

    # Extract host from SUPABASE_URL (https://xxx.supabase.co -> db.xxx.supabase.co)
    if [ -n "${SUPABASE_URL:-}" ]; then
        local PROJECT_REF=$(echo "$SUPABASE_URL" | sed -n 's|https://\([^.]*\)\.supabase\.co.*|\1|p')
        if [ -n "$PROJECT_REF" ]; then
            PG_HOST="db.${PROJECT_REF}.supabase.co"
        fi
    fi

    cat > "${BITMAGNET_DIR}/.env" << EOF
# Bitmagnet Configuration
# See: https://bitmagnet.io/setup/configuration.html
# Auto-generated by setup-dht-services.sh

# Database (Supabase PostgreSQL)
POSTGRES_HOST=${PG_HOST:-db.xxx.supabase.co}
POSTGRES_PORT=${PG_PORT}
POSTGRES_USER=${PG_USER}
POSTGRES_PASSWORD=${PG_PASS:-your-password}
POSTGRES_DATABASE=${PG_DB}

# DHT Crawler Settings
DHT_CRAWLER_SAVE_FILES_THRESHOLD=0
DHT_CRAWLER_SAVE_PIECES=false
DHT_CRAWLER_SCALING_FACTOR=${SCALING}

# Worker Settings
QUEUE_CONCURRENCY=${CONCURRENCY}
EOF

    chown "${SERVICE_USER}:${SERVICE_USER}" "${BITMAGNET_DIR}/.env"
    chmod 600 "${BITMAGNET_DIR}/.env"

    if [ -z "$PG_PASS" ] || [ "$PG_PASS" = "your-password" ]; then
        log_warn "Created ${BITMAGNET_DIR}/.env - missing SUPABASE_DB_PASSWORD in main .env"
    else
        log_info "Created ${BITMAGNET_DIR}/.env with Supabase credentials"
    fi
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
        log_info "Creating DHT API configuration..."

        # Use vars from main .env
        local API_PORT="${DHT_API_PORT:-8081}"
        local API_SALT="${DHT_API_KEY_SALT:-$(openssl rand -hex 16)}"
        local SB_URL="${SUPABASE_URL:-}"
        local SB_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
        local REDIS="${REDIS_URL:-redis://localhost:6379}"

        cat > "${DHT_API_DIR}/.env" << EOF
# DHT Search API Configuration
# Auto-generated by setup-dht-services.sh

# Supabase
SUPABASE_URL=${SB_URL:-https://xxx.supabase.co}
SUPABASE_SERVICE_KEY=${SB_KEY:-your-service-key}

# Redis (optional)
REDIS_URL=${REDIS}

# API Settings
PORT=${API_PORT}
NODE_ENV=production
LOG_LEVEL=info

# API Key Salt
API_KEY_SALT=${API_SALT}
EOF
        chmod 600 "${DHT_API_DIR}/.env"

        if [ -z "$SB_KEY" ] || [ "$SB_KEY" = "your-service-key" ]; then
            log_warn "Created ${DHT_API_DIR}/.env - please verify Supabase credentials"
        else
            log_info "Created ${DHT_API_DIR}/.env with credentials from main .env"
        fi
    fi

    # Set ownership before installing dependencies (pnpm needs write access)
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "${DHT_API_DIR}"

    # Install dependencies as the service user
    cd "${DHT_API_DIR}"
    PNPM_HOME="/home/${SERVICE_USER}/.local/share/pnpm"
    if [ -d "$PNPM_HOME" ]; then
        sudo -u "${SERVICE_USER}" bash -c "export PATH=\"${PNPM_HOME}:\$PATH\" && cd ${DHT_API_DIR} && pnpm install"
    else
        # Fall back to system pnpm
        sudo -u "${SERVICE_USER}" pnpm install
    fi
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

    local API_PORT="${DHT_API_PORT:-8081}"

    if command -v ufw &> /dev/null; then
        # DHT uses UDP
        ufw allow 3334/udp comment "Bitmagnet DHT" 2>/dev/null || true
        # API port (internal, usually behind reverse proxy)
        ufw allow ${API_PORT}/tcp comment "DHT Search API" 2>/dev/null || true
        log_info "UFW rules added (DHT: 3334/udp, API: ${API_PORT}/tcp)"
    else
        log_warn "UFW not found - please configure your firewall manually"
        log_warn "Required ports: 3334/udp (DHT), ${API_PORT}/tcp (API)"
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

    # Show current service status
    echo "Service Status:"
    if systemctl is-active --quiet bitmagnet 2>/dev/null; then
        echo "  - Bitmagnet: RUNNING"
    else
        echo "  - Bitmagnet: STOPPED"
    fi
    if systemctl is-active --quiet dht-api 2>/dev/null; then
        echo "  - DHT API:   RUNNING"
    else
        echo "  - DHT API:   STOPPED"
    fi
    echo ""

    echo "Commands:"
    echo "  Start:   sudo systemctl start bitmagnet dht-api"
    echo "  Stop:    sudo systemctl stop bitmagnet dht-api"
    echo "  Status:  sudo systemctl status bitmagnet dht-api"
    echo "  Logs:    tail -f /var/log/bitmagnet.log /var/log/dht-api.log"
    echo ""
    echo "Configuration files:"
    echo "  - Bitmagnet: $BITMAGNET_DIR/.env"
    echo "  - DHT API:   $DHT_API_DIR/.env"
    echo ""
    local API_PORT="${DHT_API_PORT:-8081}"

    echo "Generate an API key:"
    echo "  cd $DHT_API_DIR && pnpm generate-key pro \"My App\""
    echo ""
    echo "API Endpoints:"
    echo "  - Health:  http://localhost:${API_PORT}/health"
    echo "  - Search:  http://localhost:${API_PORT}/v1/search?q=ubuntu"
    echo "  - Stats:   http://localhost:${API_PORT}/v1/stats"
    echo ""
}

# Start services if configured
start_services_if_configured() {
    log_info "Checking if services can be auto-started..."

    # Check if Bitmagnet has valid credentials
    local BM_PASS=$(grep -E "^POSTGRES_PASSWORD=" "${BITMAGNET_DIR}/.env" 2>/dev/null | cut -d= -f2)
    local API_KEY=$(grep -E "^SUPABASE_SERVICE_KEY=" "${DHT_API_DIR}/.env" 2>/dev/null | cut -d= -f2)

    if [ -n "$BM_PASS" ] && [ "$BM_PASS" != "your-password" ]; then
        log_info "Starting Bitmagnet service..."
        systemctl start bitmagnet || log_warn "Failed to start bitmagnet"
        sleep 2
        if systemctl is-active --quiet bitmagnet; then
            log_info "Bitmagnet is running"
        else
            log_warn "Bitmagnet failed to start - check logs: journalctl -u bitmagnet"
        fi
    else
        log_warn "Bitmagnet not started - missing POSTGRES_PASSWORD in ${BITMAGNET_DIR}/.env"
    fi

    if [ -n "$API_KEY" ] && [ "$API_KEY" != "your-service-key" ]; then
        log_info "Starting DHT API service..."
        systemctl start dht-api || log_warn "Failed to start dht-api"
        sleep 2
        if systemctl is-active --quiet dht-api; then
            log_info "DHT API is running"
        else
            log_warn "DHT API failed to start - check logs: journalctl -u dht-api"
        fi
    else
        log_warn "DHT API not started - missing SUPABASE_SERVICE_KEY in ${DHT_API_DIR}/.env"
    fi
}

# Main
main() {
    log_info "Starting DHT Services Setup (user: ${SERVICE_USER})..."
    log_info "Project root: ${PROJECT_ROOT}"

    check_root
    load_main_env
    install_dependencies
    install_bitmagnet
    setup_bitmagnet_config
    setup_dht_api
    install_systemd_services
    configure_firewall
    start_services_if_configured
    print_status
}

main "$@"
