#!/usr/bin/env bash
set -euo pipefail

# act-setup.sh
# Installs Docker Engine (official repo), configures docker group, installs act, and pulls a runner image.
# Ubuntu 20.04/22.04/24.04 compatible.
# This script is IDEMPOTENT - safe to run multiple times.

if [[ $EUID -ne 0 ]]; then
  echo "Please run with sudo:"
  echo "  sudo bash $0"
  exit 1
fi

# Helper function to check if a package is installed
is_pkg_installed() {
  dpkg -l "$1" 2>/dev/null | grep -q "^ii"
}

# Helper function to check if all required packages are installed
all_pkgs_installed() {
  for pkg in "$@"; do
    if ! is_pkg_installed "$pkg"; then
      return 1
    fi
  done
  return 0
}

PREREQ_PKGS=(ca-certificates curl gnupg lsb-release tar)
DOCKER_PKGS=(docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin)

echo "[1/6] Checking prerequisites..."
if all_pkgs_installed "${PREREQ_PKGS[@]}"; then
  echo "  ✓ Prerequisites already installed, skipping."
else
  echo "  Installing prerequisites..."
  apt-get update -y
  apt-get install -y "${PREREQ_PKGS[@]}"
fi

echo "[2/6] Setting up Docker apt repo (official)..."
install -m 0755 -d /etc/apt/keyrings

if [[ -f /etc/apt/keyrings/docker.gpg ]]; then
  echo "  ✓ Docker GPG key already exists, skipping."
else
  echo "  Downloading Docker GPG key..."
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi

CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
ARCH="$(dpkg --print-architecture)"
DOCKER_LIST_CONTENT="deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable"

if [[ -f /etc/apt/sources.list.d/docker.list ]] && grep -qF "${DOCKER_LIST_CONTENT}" /etc/apt/sources.list.d/docker.list 2>/dev/null; then
  echo "  ✓ Docker apt source already configured, skipping."
else
  echo "  Configuring Docker apt source..."
  echo "${DOCKER_LIST_CONTENT}" > /etc/apt/sources.list.d/docker.list
  # Need to update apt cache after adding new source
  apt-get update -y
fi

echo "[3/6] Checking Docker Engine + plugins..."
if all_pkgs_installed "${DOCKER_PKGS[@]}"; then
  echo "  ✓ Docker packages already installed, skipping."
else
  echo "  Installing Docker packages..."
  # Only update if we haven't already in step 2
  if [[ ! -f /etc/apt/sources.list.d/docker.list ]] || ! grep -qF "${DOCKER_LIST_CONTENT}" /etc/apt/sources.list.d/docker.list 2>/dev/null; then
    apt-get update -y
  fi
  apt-get install -y "${DOCKER_PKGS[@]}"
fi

echo "[4/6] Checking Docker service..."
if systemctl is-active --quiet docker; then
  echo "  ✓ Docker service already running, skipping."
else
  echo "  Enabling and starting Docker service..."
  systemctl enable --now docker
fi

# Figure out the non-root user that invoked sudo
TARGET_USER="${SUDO_USER:-}"
if [[ -z "${TARGET_USER}" || "${TARGET_USER}" == "root" ]]; then
  echo "Could not determine the non-root user (SUDO_USER is empty)."
  echo "Docker installed, but you'll need to add your user to the docker group manually:"
  echo "  sudo usermod -aG docker <your-username>"
  echo "  newgrp docker"
else
  echo "[5/6] Checking docker group membership for '${TARGET_USER}'..."
  # Ensure docker group exists
  if ! getent group docker >/dev/null 2>&1; then
    echo "  Creating docker group..."
    groupadd docker
  fi
  
  # Check if user is already in docker group
  if id -nG "${TARGET_USER}" | grep -qw docker; then
    echo "  ✓ User '${TARGET_USER}' already in docker group, skipping."
  else
    echo "  Adding user '${TARGET_USER}' to docker group..."
    usermod -aG docker "${TARGET_USER}"
    echo "  NOTE: You must log out/in (or run: newgrp docker) for group changes to take effect."
  fi
fi

echo "[6/6] Checking act installation..."
# Check if act is already installed and get its version
if command -v act >/dev/null 2>&1; then
  INSTALLED_ACT_VERSION="$(act --version 2>/dev/null | head -1 || echo "")"
  echo "  ✓ act already installed: ${INSTALLED_ACT_VERSION}"
  echo "  Skipping reinstall. To force update, remove /usr/local/bin/act first."
else
  echo "  Installing act..."
  ACT_TGZ="/tmp/act_Linux_x86_64.tar.gz"
  curl -fsSL https://github.com/nektos/act/releases/latest/download/act_Linux_x86_64.tar.gz -o "${ACT_TGZ}"
  tar -xzf "${ACT_TGZ}" -C /usr/local/bin act
  chmod +x /usr/local/bin/act
  rm -f "${ACT_TGZ}"
  echo "  act version: $(/usr/local/bin/act --version || echo 'unknown')"
fi

RUNNER_IMAGE="ghcr.io/catthehacker/ubuntu:full-latest"
echo "Checking runner image..."
if docker image inspect "${RUNNER_IMAGE}" >/dev/null 2>&1; then
  echo "  ✓ Runner image '${RUNNER_IMAGE}' already present, skipping pull."
  echo "  To update the image, run: docker pull ${RUNNER_IMAGE}"
else
  echo "  Pulling recommended runner image (this is large, but avoids missing deps)..."
  docker pull "${RUNNER_IMAGE}"
fi

# Write ~/.actrc for the target user (or root if unknown)
ACTRC_USER_HOME="/root"
if [[ -n "${TARGET_USER}" && "${TARGET_USER}" != "root" ]]; then
  ACTRC_USER_HOME="$(eval echo "~${TARGET_USER}")"
fi

ACTRC_PATH="${ACTRC_USER_HOME}/.actrc"
ACTRC_CONTENT="-P ubuntu-latest=${RUNNER_IMAGE}"

echo "Checking .actrc configuration..."
if [[ -f "${ACTRC_PATH}" ]] && grep -qF "${ACTRC_CONTENT}" "${ACTRC_PATH}" 2>/dev/null; then
  echo "  ✓ ${ACTRC_PATH} already configured correctly, skipping."
else
  echo "  Writing ${ACTRC_PATH}..."
  echo "${ACTRC_CONTENT}" > "${ACTRC_PATH}"
  chown "${TARGET_USER:-root}:${TARGET_USER:-root}" "${ACTRC_PATH}" 2>/dev/null || true
fi

echo ""
echo "✅ Done."
echo ""
echo "Next steps (IMPORTANT):"
if [[ -n "${TARGET_USER}" && "${TARGET_USER}" != "root" ]]; then
  # Check if user needs to re-login for docker group
  if ! id -nG "${TARGET_USER}" | grep -qw docker 2>/dev/null || ! groups 2>/dev/null | grep -qw docker; then
    echo "  1) Log out/in OR run: newgrp docker"
  fi
fi
echo "  2) From your repo root, run:"
echo "       act"
echo "     or:"
echo "       act -j <jobname> -v"
echo ""
echo "If you see Redis port conflicts (6379 already in use), remove ports: mapping from services in your workflow."
