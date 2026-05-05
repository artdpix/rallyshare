#!/usr/bin/env bash
# RallyShare — Debian 12 bootstrap
# Instala Docker, Node, pnpm, WireGuard, integração de hypervisor e prepara
# pastas para a stack RallyShare correr via docker compose.
#
# Uso:   sudo bash bootstrap.sh
# Override do utilizador alvo (default: SUDO_USER):
#        sudo TARGET_USER=meu-user bash bootstrap.sh
#
# Idempotente — é seguro executar várias vezes.

set -euo pipefail

if [ "$EUID" -ne 0 ]; then
    echo "Tem de correr como root. Tenta:  sudo bash $0"
    exit 1
fi

TARGET_USER="${TARGET_USER:-${SUDO_USER:-$(logname 2>/dev/null || echo debian)}}"
if ! id "$TARGET_USER" >/dev/null 2>&1; then
    echo "Utilizador '${TARGET_USER}' não existe. Usa: TARGET_USER=<nome> sudo bash $0"
    exit 1
fi

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

log "Setup para utilizador '${TARGET_USER}'"

# ---------------------------------------------------------------------------
log "1/9  Actualizar índice e pacotes base"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade

# ---------------------------------------------------------------------------
log "2/9  Utilitários do sistema"
apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg lsb-release \
    git vim htop tmux jq unzip rsync \
    ufw build-essential openssh-server \
    ffmpeg

systemctl enable --now ssh

# ---------------------------------------------------------------------------
log "3/9  Integração com hypervisor (auto-detect)"
HV="$(systemd-detect-virt 2>/dev/null || echo none)"
echo "    hypervisor detectado: ${HV}"
case "$HV" in
    microsoft)
        apt-get install -y --no-install-recommends \
            linux-cloud-tools-virtual hyperv-daemons || true
        ;;
    kvm|qemu)
        apt-get install -y --no-install-recommends qemu-guest-agent
        systemctl enable --now qemu-guest-agent
        ;;
    *)
        echo "    nenhum guest tools instalado (sem hypervisor reconhecido)"
        ;;
esac

# ---------------------------------------------------------------------------
log "4/9  Docker Engine + Compose plugin (repositório oficial)"
install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/debian/gpg \
        -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
fi

ARCH="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
cat > /etc/apt/sources.list.d/docker.list <<EOF
deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${CODENAME} stable
EOF

apt-get update
apt-get install -y \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

usermod -aG docker "$TARGET_USER"
echo "    '${TARGET_USER}' adicionado ao grupo docker (logout/login para activar)"

# ---------------------------------------------------------------------------
log "5/9  Node.js 20 LTS (NodeSource)"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
    if node --version | grep -q '^v20\.'; then
        NEED_NODE=0
    fi
fi
if [ "$NEED_NODE" -eq 1 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "    node:  $(node --version)"
echo "    npm:   $(npm --version)"

# ---------------------------------------------------------------------------
log "6/9  pnpm via corepack"
corepack enable
corepack prepare pnpm@9.15.0 --activate
echo "    pnpm:  $(pnpm --version)"

# ---------------------------------------------------------------------------
log "7/9  WireGuard (cliente para o túnel até ao PC do vMix)"
apt-get install -y wireguard wireguard-tools
# Configuração concreta do peer faz-se à parte em /etc/wireguard/wg0.conf

# ---------------------------------------------------------------------------
log "8/9  Estrutura de pastas para media e dados"
install -d -o "$TARGET_USER" -g "$TARGET_USER" -m 0755 /srv/rally
install -d -o "$TARGET_USER" -g "$TARGET_USER" -m 0755 \
    /srv/rally/media \
    /srv/rally/media/raw \
    /srv/rally/media/processed \
    /srv/rally/media/sync \
    /srv/rally/media/rejected \
    /srv/rally/pgdata

# ---------------------------------------------------------------------------
log "9/9  Firewall (UFW)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
# Cloudflare Tunnel é saída-só → não precisamos de abrir as portas dos apps.
# Descomenta se quiseres aceder aos serviços directamente da LAN para debug:
# ufw allow 3000/tcp     # web (Next.js)
# ufw allow 4000/tcp     # api (NestJS)
# ufw allow 8384/tcp     # Syncthing UI
# ufw allow 22000        # Syncthing sync
# ufw allow 21027/udp    # Syncthing discovery
# ufw allow 51820/udp    # WireGuard
ufw --force enable

# ---------------------------------------------------------------------------
log "Setup concluído"

cat <<EOF

──────────────────────────────────────────────────────
  Hypervisor : ${HV}
  Docker     : $(docker --version)
  Compose    : $(docker compose version --short 2>/dev/null || echo '??')
  Node       : $(node --version)
  pnpm       : $(pnpm --version)
  WireGuard  : $(wg --version | head -1)
──────────────────────────────────────────────────────

Próximos passos (como utilizador '${TARGET_USER}'):

  1. Logout e voltar a entrar (para o grupo docker entrar em vigor):
       exit

  2. Clonar o repositório:
       cd ~
       git clone <url-do-repo> rallyshare
       cd rallyshare

  3. Configurar variáveis de ambiente:
       cp .env.example .env
       \$EDITOR .env

  4. Instalar deps e arrancar:
       pnpm install
       pnpm infra:up
       pnpm db:migrate          # primeira vez (escreve 'init' como nome)
       pnpm dev

  5. Verificar:
       curl http://localhost:4000/health
       # Web em http://<ip-da-vm>:3000

  6. WireGuard (mais tarde):
       sudo nano /etc/wireguard/wg0.conf
       sudo systemctl enable --now wg-quick@wg0

  7. Cloudflare Tunnel (mais tarde):
       Adicionar o serviço 'cloudflared' ao compose.yml com o token
       gerado no painel CF Zero Trust.

EOF
