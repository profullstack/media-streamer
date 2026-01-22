#!/bin/bash
#
# DHT Crawler Services Setup Script
# This script sets up the Bitmagnet DHT crawler and DHT Search API services
#
# Usage: sudo bash setup-dht-services.sh
#
# Requirements:
# - Ubuntu 22.04+ or Debian 12+
# - Root or sudo access
# - .env file with Supabase credentials
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BITMAGNET_VERSION="v0.9.5"
BITMAGNET_DIR="/opt/bitmagnet"
DHT_API_DIR="/opt/dht-api"
DHT_USER="dht"
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
        log_error "This script must be run as root"
        exit 1
    fi
}

# Create dht user if it doesn't exist
create_user() {
    log_info "Creating DHT service user..."
    if ! id -u "$DHT_USER" > /dev/null 2>&1; then
        useradd --system --shell /bin/false --home-dir /opt/bitmagnet "$DHT_USER"
        log_info "Created user: $DHT_USER"
    else
        log_info "User $DHT_USER already exists"
    fi
}

# Install system dependencies
install_dependencies() {
    log_info "Installing system dependencies..."
    apt-get update
    apt-get install -y \
        curl \
        wget \
        unzip \
        git \
        ca-certificates

    # Install Node.js if not present
    if ! command -v node &> /dev/null; then
        log_info "Installing Node.js 22..."
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
        apt-get install -y nodejs
    fi
    log_info "Node.js version: $(node --version)"

    # Install pnpm if not present
    if ! command -v pnpm &> /dev/null; then
        log_info "Installing pnpm..."
        npm install -g pnpm
    fi
    log_info "pnpm version: $(pnpm --version)"
}

# Download and install Bitmagnet
install_bitmagnet() {
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

    log_info "Bitmagnet installed to $BITMAGNET_DIR/bitmagnet"
}

# Setup Bitmagnet configuration
setup_bitmagnet_config() {
    log_info "Setting up Bitmagnet configuration..."

    # Create .env file if template exists
    if [[ -f "$SERVICE_DIR/.env.bitmagnet.example" ]]; then
        if [[ ! -f "$BITMAGNET_DIR/.env" ]]; then
            cp "$SERVICE_DIR/.env.bitmagnet.example" "$BITMAGNET_DIR/.env"
            log_warn "Created $BITMAGNET_DIR/.env from template - please edit with your credentials"
        fi
    else
        # Create minimal .env template
        if [[ ! -f "$BITMAGNET_DIR/.env" ]]; then
            cat > "$BITMAGNET_DIR/.env" << 'EOF'
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
            log_warn "Created $BITMAGNET_DIR/.env template - please edit with your credentials"
        fi
    fi

    chown -R "$DHT_USER:$DHT_USER" "$BITMAGNET_DIR"
}

# Setup DHT Search API
setup_dht_api() {
    log_info "Setting up DHT Search API..."

    mkdir -p "$DHT_API_DIR"

    # Copy API source files
    cp -r "$SERVICE_DIR/src" "$DHT_API_DIR/"
    cp "$SERVICE_DIR/package.json" "$DHT_API_DIR/"
    cp "$SERVICE_DIR/tsconfig.json" "$DHT_API_DIR/"

    # Copy scripts
    mkdir -p "$DHT_API_DIR/scripts"
    cp -r "$SERVICE_DIR/scripts/"*.ts "$DHT_API_DIR/scripts/" 2>/dev/null || true

    # Create .env file
    if [[ ! -f "$DHT_API_DIR/.env" ]]; then
        if [[ -f "$SERVICE_DIR/.env.example" ]]; then
            cp "$SERVICE_DIR/.env.example" "$DHT_API_DIR/.env"
        else
            cat > "$DHT_API_DIR/.env" << 'EOF'
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
        fi
        log_warn "Created $DHT_API_DIR/.env - please edit with your credentials"
    fi

    # Install dependencies
    cd "$DHT_API_DIR"
    pnpm install

    chown -R "$DHT_USER:$DHT_USER" "$DHT_API_DIR"
    log_info "DHT Search API installed to $DHT_API_DIR"
}

# Install systemd services
install_systemd_services() {
    log_info "Installing systemd services..."

    # Copy service files
    cp "$SERVICE_DIR/systemd/bitmagnet.service" /etc/systemd/system/
    cp "$SERVICE_DIR/systemd/dht-api.service" /etc/systemd/system/

    # Copy logrotate configs
    cp "$SERVICE_DIR/systemd/bitmagnet.logrotate" /etc/logrotate.d/bitmagnet
    cp "$SERVICE_DIR/systemd/dht-api.logrotate" /etc/logrotate.d/dht-api

    # Create log files with correct permissions
    touch /var/log/bitmagnet.log /var/log/bitmagnet.error.log
    touch /var/log/dht-api.log /var/log/dht-api.error.log
    chown "$DHT_USER:$DHT_USER" /var/log/bitmagnet.* /var/log/dht-api.*

    # Reload systemd
    systemctl daemon-reload

    log_info "systemd services installed"
}

# Configure firewall
configure_firewall() {
    log_info "Configuring firewall..."

    if command -v ufw &> /dev/null; then
        # DHT uses UDP
        ufw allow 3334/udp comment "Bitmagnet DHT"
        # API port (internal, usually behind reverse proxy)
        ufw allow 3333/tcp comment "DHT Search API"
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
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Configure Bitmagnet environment:"
    echo "   nano $BITMAGNET_DIR/.env"
    echo ""
    echo "2. Configure DHT API environment:"
    echo "   nano $DHT_API_DIR/.env"
    echo ""
    echo "3. Run database migrations (from main project):"
    echo "   supabase db push --linked --include-all"
    echo ""
    echo "4. Start the services:"
    echo "   sudo systemctl enable --now bitmagnet"
    echo "   sudo systemctl enable --now dht-api"
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
    log_info "Starting DHT Services Setup..."

    check_root
    create_user
    install_dependencies
    install_bitmagnet
    setup_bitmagnet_config
    setup_dht_api
    install_systemd_services
    configure_firewall
    print_status
}

main "$@"
