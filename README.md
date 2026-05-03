# RallyShare

Plataforma para espectadores de transmissões de rally submeterem fotos e clips de vídeo (anónimos ou identificados) que são depois usados em direto na régie via vMix.

Plano completo, arquitectura e roadmap em [projecto.md](./projecto.md).

---

## Pré-requisitos

- **Node.js 20+**
- **pnpm 9+**
- **Docker** (Desktop em Windows/Mac, Engine em Linux) com Compose v2

---

## Setup local — Windows

### 1. Instalar pnpm

Sem precisar de admin, instalador oficial standalone:

```powershell
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

Fechar e reabrir o PowerShell. Confirmar:

```powershell
pnpm --version
```

> **Alternativa sem instalar:** se o Node.js for ≥ 16, podes prefixar tudo com `corepack`:
> `corepack pnpm install`, `corepack pnpm dev`, etc.
> O `corepack enable` (que cria o atalho `pnpm`) precisa de admin em Windows porque escreve em `C:\Program Files\nodejs`.

### 2. Iniciar o Docker Desktop

Abrir o Docker Desktop pelo menu Iniciar e esperar até o ícone na barra das tarefas ficar estável (~30s).

### 3. Instalar dependências e arrancar

```powershell
pnpm install
copy .env.example .env
pnpm infra:up        # postgres, redis, syncthing
pnpm db:migrate      # primeira vez — escreve "init" como nome
pnpm dev             # arranca api, web, worker em paralelo
```

Aceder:

- Web: http://localhost:3000
- API: http://localhost:4000/health
- Syncthing UI: http://localhost:8384

---

## Setup numa VM Debian 12 (dev em Hyper-V ou prod em Proxmox)

### 1. Instalar Debian 12

Durante a instalação:

- Criar utilizador normal (ex: `rally`)
- No `tasksel` (ecrã final), marcar **SSH server**
- Resto pode ficar em defaults

### 2. Bootstrap automatizado

O script [`infra/vm/bootstrap.sh`](./infra/vm/bootstrap.sh) instala tudo (Docker, Node, pnpm, WireGuard, integração hypervisor, firewall, pastas).

Copiar para a VM (a partir do Windows):

```powershell
scp infra\vm\bootstrap.sh rally@<ip-da-vm>:~/
```

Na VM:

```bash
sudo bash bootstrap.sh
exit                          # logout para o grupo docker entrar em vigor
```

Voltar a entrar e:

```bash
git clone <url-do-repo> rallyshare
cd rallyshare
cp .env.example .env
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm dev
```

### 3. Editar a partir do Windows

Para hot-reload com o código a correr na VM mas a editar do Windows:

1. Instalar extensão **Remote - SSH** no VS Code
2. `F1` → *Remote-SSH: Connect to Host* → `rally@<ip-da-vm>`
3. Abrir `~/rallyshare`
4. Os ports 3000/4000 são reencaminhados automaticamente para `localhost` no PC

---

## Comandos úteis

```bash
pnpm dev              # arranca tudo em paralelo (api + web + worker)
pnpm infra:up         # postgres + redis + syncthing
pnpm infra:down       # pára e remove os containers (preserva volumes)
pnpm infra:logs       # segue os logs da infra
pnpm db:migrate       # aplica migrations e gera o cliente Prisma
pnpm db:studio        # GUI web para a base de dados
pnpm build            # build de produção de todos os apps
```

---

## Estrutura

```
rallyshare/
├── projecto.md             # plano completo, decisões, roadmap
├── compose.yml             # postgres + redis + syncthing (dev)
├── apps/
│   ├── api/                # NestJS  (porta 4000)
│   ├── web/                # Next.js 15 (porta 3000)
│   └── worker/             # BullMQ + FFmpeg consumer
├── packages/
│   ├── db/                 # Prisma schema + cliente partilhado
│   └── shared/             # tipos zod (contract API ↔ Web)
└── infra/
    └── vm/
        └── bootstrap.sh    # provisão de VM Debian (dev e prod)
```

---

## Troubleshooting

**`pnpm : The term 'pnpm' is not recognized`**
→ pnpm não está no PATH. Usa o instalador standalone (secção *Setup local — Windows*) ou prefixa com `corepack pnpm`.

**`corepack enable` falha com `EPERM ... C:\Program Files\nodejs`**
→ Em Windows precisa de admin para criar os atalhos. Alternativas: instalar pnpm standalone (sem admin), correr o `corepack enable` numa PowerShell *Run as Administrator*, ou usar `corepack pnpm <comando>` directamente.

**`error during connect: ... docker daemon is not running`**
→ Iniciar o Docker Desktop e esperar ~30s antes de correr `pnpm infra:up`.

**Worker dá `ECONNREFUSED 127.0.0.1:6379`**
→ Redis não está a correr. Correr `pnpm infra:up` antes do `pnpm dev`.

**API dá `Can't reach database server`**
→ Postgres não está a correr (`pnpm infra:up`) ou as migrations ainda não foram aplicadas (`pnpm db:migrate`).

**Em Linux, `docker` pede sudo sempre**
→ Faltou logout/login depois do bootstrap. O grupo `docker` só entra em vigor numa nova sessão.
