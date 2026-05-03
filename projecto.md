# RallyShare — Plataforma de submissão de clips/fotos para transmissões live de rally

> Documento de partida. Vivo. Editar à medida que o projecto evolui.

## 1. Objectivo

Permitir que espectadores de transmissões de rally submetam fotos e clips de vídeo (anónimos ou identificados) para serem usados em direto na régie via vMix.

Stack auto-alojada num servidor Proxmox existente, com **Cloudflare Free** como camada de edge (TLS, DDoS, WAF, captcha, auth do operador, e — crucial — Cloudflare Tunnel para evitar abrir portas públicas no servidor).

Integra-se com o pipeline gráfico já existente em SPX-GC (`c:\www\laragon\www\SPX-GC\ASSETS\templates\rally\style1`) para créditos on-screen consistentes.

---

## 2. Arquitectura

```
                                    Internet
                                       │
                              ┌────────▼────────┐
                              │  Cloudflare     │  (TLS, WAF, DDoS,
                              │  (Free plan)    │   Turnstile, Access)
                              └────────┬────────┘
                                       │  cloudflared (saída-só)
                                       │
                  ┌────────────────────▼────────────────────┐
                  │  Proxmox: 1 VM Debian 12 (rallyshare)   │
                  │  ──────────────────────────────         │
                  │  docker compose:                        │
                  │    cloudflared                          │
                  │    app       (Next.js + NestJS)         │
                  │    worker    (FFmpeg + BullMQ)          │
                  │    postgres                             │
                  │    redis                                │
                  │    syncthing                            │
                  │                                         │
                  │  Volumes (bind):                        │
                  │    /srv/rally/media/{raw,processed,     │
                  │                     sync,rejected}      │
                  │    /srv/rally/pgdata                    │
                  └────────────────────┬────────────────────┘
                                       │ Syncthing sobre WireGuard
                                       ▼
                              ┌────────────────┐
                              │  PC do vMix    │
                              │  C:\rally\sync │  ← ficheiros sempre locais
                              │  vMix HTTP API │
                              └────────────────┘
```

### Host: VM Debian no Proxmox (não LXC)

**Uma única VM Debian 12** com Docker. Toda a stack corre em `docker compose`. Mesma `compose.yml` para dev local (Hyper-V no PC) e produção (Proxmox).

| VM | Recursos sugeridos | Função |
|---|---|---|
| `rallyshare` | 6 vCPU, 8 GB RAM, 200 GB disco virtio-scsi (cache=writeback), `qemu-guest-agent` | Stack inteira via Docker Compose |

**Porquê VM em vez de LXC** (decisão revista):
- **Suporte oficial.** Docker em LXC Proxmox é "use at your own risk", requer `nesting=1` e ajustes de cgroups. Em VM é o caminho normal, suportado por toda a gente.
- **Dia de transmissão.** Em direto com FFmpeg a 100% CPU não queremos diagnosticar edge-cases de docker-em-LXC. VM é o caminho aborrecido e previsível.
- **Overhead irrelevante** para esta carga (Node + FFmpeg + Postgres) — virtio perde 3–8%, nada que se note.
- **GPU passthrough** para NVENC futuro é trivial em VM, complicado em LXC.
- **Portabilidade.** Imagem `.qcow2` corre em qualquer KVM/cloud se um dia precisarmos de migrar.
- Snapshots Proxmox continuam rápidos o suficiente (~30s para "snapshot antes do rally").

**Porquê 1 VM** (em vez dos 5 LXCs da versão inicial):
- Para 500 submissões/evento, isolar serviços em VMs separadas é overhead operacional sem ganho real (falha do worker normalmente significa que a transmissão tem outro problema maior).
- 1 VM = 1 snapshot = 1 firewall scope = 1 ponto onde correr `docker compose up`.
- Mesma `compose.yml` em dev local e prod — onboarding trivial.
- Escalar é trocar `replicas: N` no compose ou, se um dia for necessário, separar `data` para outra VM sem mudar código.

### Ambiente de desenvolvimento local (Hyper-V)

Para dev/prod parity, correr o mesmo Debian 12 em Hyper-V no PC de desenvolvimento:

- **Hyper-V Geração 2**, Secure Boot OFF (ou template "MS UEFI CA")
- 4 vCPU, 6 GB RAM, 60 GB disco dinâmico
- **Default Switch** (NAT) para dev simples; **External Switch** se precisares de testar a PWA a partir do telemóvel na mesma LAN
- Instalar `linux-cloud-tools-virtual` no Debian → integração Hyper-V (mouse, dynamic memory, time sync)
- Workflow: código editado no Windows, VS Code com **Remote - SSH** para a VM, `git` no host Windows, repo clonado na VM, `docker compose up` corre lá dentro com bind-mount do código → hot-reload normal
- Cloudflare Tunnel separado para dev (`rally-dev.<dominio>`) — grátis criar um segundo no painel CF
- Para o caminho vMix: ou apontar para o vMix real via WG, ou levantar um segundo Hyper-V (Windows com vMix trial) na mesma rede

### Serviços Docker dentro do LXC

| Serviço | Imagem | Função |
|---|---|---|
| `cloudflared` | `cloudflare/cloudflared` | Túnel para Cloudflare (sem portas abertas) |
| `app` | (build próprio) | Next.js (público + `/admin`) + API NestJS |
| `worker` | (build próprio) | FFmpeg, thumbnails, NSFW flag, pHash, BullMQ consumer |
| `postgres` | `postgres:16-alpine` | Estado aplicacional |
| `redis` | `redis:7-alpine` | Fila BullMQ |
| `syncthing` | `syncthing/syncthing` | Sincroniza `/srv/rally/media/sync/` para o PC do vMix |

**Sem MinIO.** Para este volume e padrão de acesso (upload via tus pelo backend, não direct-to-storage do browser), filesystem em bind mount chega. Pasta `/srv/rally/media/` partilhada entre `app`, `worker` e `syncthing`. Se um dia precisarmos de pré-signed URLs ou multi-node, introduz-se MinIO sem mudar muito código (é só trocar o adapter de storage).

Snapshots Proxmox antes de cada rally → rollback em segundos se algo correr mal em direto. Backup do `pgdata` por `pg_dump` agendado para outro disco/host.

### Dimensionamento para ~500 submissões/evento

Premissa: 500 peças (mix foto/vídeo) distribuídas por ~6–8h de prova, com picos no final de cada PEC.

- **Pico estimado:** ~150 submissões/hora nos picos (3× a média)
- **Worker:** concorrência 4 transcodes paralelos chega folgadamente (vídeo 60s @ 1080p ≈ 15–30s de transcode em 4 vCPU sem GPU). Limitar concorrência via `BULL_CONCURRENCY` para não competir com o `app`.
- **Storage por evento (estimativa):**
  - Raw: 500 × ~80 MB médio = **~40 GB**
  - Processed: ~25 GB
  - Thumbs/aprovados duplicados: desprezível
  - **200 GB no LXC** dá margem para 3–4 eventos antes de purgar raw
- **Postgres:** trivial a este volume.
- **Banda Cloudflare Tunnel:** plano grátis sem hard cap documentado para uso razoável; 500 uploads × 80 MB ≈ 40 GB ingress por evento — sem problema, mas monitorizar.

---

## 3. O que o Cloudflare Free trata por nós

Reduz código, infra e operações que de outra forma teríamos de manter:

| Necessidade | Sem Cloudflare | Com Cloudflare Free |
|---|---|---|
| TLS / certificados | Caddy + ACME + renovação | TLS terminado no edge, automático |
| Ingress público | Port-forward no router + IP fixo + firewall | **Cloudflare Tunnel** — saída-só, zero portas abertas |
| DDoS / bot básico | Configurar fail2ban, Caddy rate-limits | Ligado por defeito |
| WAF | Regras Caddy/Nginx manuais | Regras gratuitas + 5 custom rules |
| Captcha anti-spam | hCaptcha (3rd party) | **Turnstile** — gratuito, sem CAPTCHAs visuais |
| Auth do dashboard operador | Implementar SSO/2FA | **Cloudflare Access** (Zero Trust, free até 50 utilizadores) — Google/email OTP em frente ao `/admin` |
| DNS | Servidor próprio | Gerido, com API |
| Cache de estáticos | Configurar Cache-Control + edge | Cache automática + Cache Rules grátis |

**O que NÃO usamos do Cloudflare:**
- R2 — egress sai caro fora do plano grátis e queremos os ficheiros perto do vMix (LAN). Mantemos MinIO local.
- Stream / Images — pago.
- Pages — separaria deploy frontend/backend desnecessariamente; o Next.js corre junto da API.

---

## 4. Stack aplicacional

### Backend (serviço `app`)
- **NestJS** (TypeScript, Node 20 LTS) — modular: `submissions`, `moderation`, `vmix`, `auth`, `events`
- **Prisma** ORM + PostgreSQL 16
- **BullMQ** sobre Redis — filas: `transcode`, `nsfw-scan`, `vmix-dispatch`
- **tus.io** — uploads resumíveis (essencial para mobile em 4G instável durante PECs)
- **Socket.IO** — fila de moderação em tempo real para o operador
- Validação Turnstile no endpoint de upload anónimo

### Frontend público (mesmo serviço `app`)
- **Next.js 15** (App Router), mesmo container que a API
- **PWA** instalável — Service Worker para upload em background
- Mobile-first, design minimalista
- Pré-compressão client-side de vídeo (`mediabunny` ou `ffmpeg.wasm`) para reduzir tempo de upload em redes lentas
- Captura GPS/EXIF quando o utilizador autoriza

### Dashboard operador (mesmo `app`, rota `/admin`)
- Mesmo Next.js, protegido por **Cloudflare Access** (não há login aplicacional para gerir)
- Layout 3 colunas: fila / preview / acções
- Atalhos teclado: `J/K` navegar, `A` aprovar, `R` rejeitar, `space` play, `Enter` enviar para vMix
- Live updates via WebSocket

### Worker (serviço `worker`)
- Node + BullMQ consumer
- **FFmpeg** — transcode para perfil **vMix-friendly**:
  - Vídeo: H.264 yuv420p, MP4, max 1080p, AAC stereo, `+faststart`
  - Foto: JPG max 4K + thumbnail 480px
- **Thumbnail** de 3s para preview no dashboard
- **NudeNet** ou similar — flag NSFW (não auto-rejeita, só sinaliza)
- **pHash** — detectar duplicados (fãs reenviam o mesmo clip várias vezes)

### Storage
- **Filesystem** em bind mount `/srv/rally/media/` partilhado entre `app`, `worker` e `syncthing`:
  ```
  /srv/rally/media/
    raw/         ← upload original do utilizador
    processed/   ← saída do worker (transcoded + thumbs)
    sync/        ← pasta espelhada por Syncthing para o PC do vMix
                  (cópia/mv para aqui no momento de aprovação ou
                   no fim do processamento, conforme estratégia §7)
    rejected/    ← retidos N dias para auditoria
  ```
- Adapter de storage no código (`packages/storage`) com interface única — trocar para S3/MinIO depois sem mexer em chamadores
- Lifecycle: cron diário no `worker` purga `rejected/` aos 7 dias, `raw/` aos 30 dias após `processed`

---

## 5. Modelo de dados (esboço)

```
events            — rally activo (nome, datas, PECs)
stages            — PECs do evento (nome, ordem, hora prevista)
submissions       — id, event_id, stage_id?, type (photo/video),
                    contributor_name?, contributor_email?, anonymous,
                    consent_at, ip_hash, device_fp, status
                    (uploading|processing|pending|approved|rejected|aired),
                    nsfw_flag, phash, duration, created_at
media_assets      — submission_id, role (raw/processed/thumb), storage_key,
                    mime, bytes, width, height
moderation_log    — submission_id, operator (CF Access email), action,
                    reason?, at
vmix_dispatches   — submission_id, method (api/hotfolder), status, at
```

---

## 6. Fluxo de submissão

1. Fã abre `rally.exemplo.pt` (PWA instalável)
2. Selecciona ficheiro da galeria ou grava na hora
3. Formulário curto:
   - **Onde** (autocomplete com PECs do `event` activo)
   - **Piloto / nº** (opcional, autocomplete)
   - **Nome do contribuidor** (opcional → vazio = anónimo)
   - **Email** (opcional, só para crédito on-air e notificação "estás no ar")
   - **Consentimento de uso** (checkbox obrigatório, GDPR)
4. Turnstile invisível
5. Upload tus para `raw/`
6. Worker: valida → transcode → thumbnail → NSFW → pHash → `processed/` → `status=pending`
7. Aparece no dashboard do operador via WebSocket

### Anti-abuso
- Rate limit por IP (CF) + por device fingerprint (app)
- Limite N submissões/hora por device
- Tamanho máx. 200 MB, duração máx. 60s (configurável por evento)
- Turnstile em todas as submissões anónimas

---

## 7. Integração com vMix

**Topologia:** PC do vMix está **remoto, ligado por VPN WireGuard** ao Proxmox. Toda a comunicação Proxmox ↔ vMix passa pelo túnel WG (rede privada estável, encriptada, mas com banda finita).

### Modelo: sincronização contínua + consumo flexível

A camada de transporte é **constante**: uma pasta espelhada em ambos os lados via sincronização contínua sobre o túnel WG. A camada de consumo (como o vMix usa o ficheiro) é **flexível** — pode mudar por peça ou por evento sem mexer na infraestrutura.

```
[rally-data] /srv/rally/sync/  ◀──── Syncthing ────▶  C:\rally\sync\  [vMix PC]
                  ▲                  (sobre WG)              │
                  │                                          ▼
            backend escreve aqui                    vMix lê (local, SSD)
            quando aprova/processa
```

### Camada de sincronização

- **Syncthing** em ambos os lados (container `syncthing` no LXC do Proxmox, serviço Windows no PC do vMix)
- Watcher de filesystem → começa a sincronizar ficheiro novo em segundos
- Resiliente a quedas da VPN (retoma onde parou, hash check)
- Web UI nativo para monitorizar progresso e fila de sync
- Bandwidth limiter configurável (não saturar a VPN durante a stream)
- Versioning desligado (não precisamos)

**Estratégia de pasta sincronizada — duas opções a decidir após medir a VPN:**

1. **Sincronizar tudo o que sai do worker** (`processed/`) — quando o operador aprova já está provavelmente local no vMix. Latência de aprovação→playable = zero. Custo: ~15–20% de banda gasta em peças que serão rejeitadas. Para 40 GB/evento, ~6–8 GB de "desperdício" — aceitável.
2. **Sincronizar só após aprovação** (`approved/`) — zero desperdício, mas há um atraso entre clicar "aprovar" e o ficheiro estar pronto a ir para o ar (segundos a 1–2 min consoante tamanho e banda).

**Recomendação:** começar com (1). Mais simples para o operador (nunca espera) e o "desperdício" é desprezível.

### Camada de consumo no vMix (escolhida pelo operador)

O backend, ao aprovar, chama a API do vMix com o caminho **local** do ficheiro (já sincronizado). O operador pode trocar entre dois modos sem mudanças no backend:

#### Modo A — Importar para Input List
```
POST http://<ip-wg-vmix>:8088/api?Function=AddInput&Value=Video|C:\rally\sync\approved\clip_42.mp4
```
vMix carrega como input pronto a usar. Operador faz `Cut`/`Overlay` quando entender. **Recomendado por defeito.**

#### Modo B — Player remoto / on-demand
Para fluxos onde o operador quer carregar à mão ou usar Title com URL externa (ex.: foto num placeholder de gráfico SPX-GC). O ficheiro continua a estar local no PC do vMix, mas o consumo é manual ou via Title.

A decisão entre A e B é por peça (botão no dashboard) ou por preset de evento. Por baixo é o mesmo ficheiro, no mesmo sítio.

### Naming e organização

```
sync/
  <event-slug>/
    YYYY-MM-DD/
      <stage-slug>/
        clip_<id>.mp4
        photo_<id>.jpg
```

### Health & robustez
- Health-check periódico do endpoint vMix HTTP — se cair, dispatches ficam `pending-vmix` e reintentam quando volta
- Health-check do estado Syncthing (API REST) — alerta no dashboard se um peer estiver `out of sync` durante o evento
- Idempotência via `vmix_dispatches` table com retry exponencial

### Crédito on-screen
- Reutilizar a estética dos templates SPX-GC existentes (`rally/style1`)
- Criar novo `IDENT_contribuidor.html` no mesmo estilo de `IDENT_piloto.html`
- Backend devolve no payload de aprovação: `{ contributor: "João S.", stage: "PEC4", thumb_url: "..." }`

---

## 8. Autenticação

| Persona | Mecanismo |
|---|---|
| Fã anónimo | Sem login. Cookie de device para "ver os meus envios" e rate-limit |
| Fã identificado | **Magic link por email** (sem passwords) |
| Operador / régie | **Cloudflare Access** em frente a `/admin` — Google SSO ou email OTP. Lista de emails autorizados gerida no painel CF |

---

## 9. GDPR / Legal (PT/UE)

- Consentimento explícito e granular no upload (texto curto: uso em direto, redes sociais do canal, arquivo)
- Política de privacidade ligada do formulário
- **Direito ao apagamento:**
  - Identificado: botão "apagar os meus envios" no perfil
  - Anónimo: código de submissão devolvido após upload, permite eliminar
- Retenção: rejeitados 7 dias, raw 30 dias, approved indefinido (com possibilidade de purge)
- IP guardado **hashado** (HMAC com salt rotativo) para anti-abuso sem reter PII directamente
- Menores: aviso obrigatório no formulário (>=18 ou consentimento parental). Validação não realista — assumir risco e documentar.

---

## 10. Observabilidade

- **Prometheus + Grafana** como dois serviços extra no mesmo `compose.yml` (não justifica LXC próprio)
- Métricas-chave por evento:
  - submissões/min, picos por PEC
  - tempo médio até aprovação
  - ratio aprovados/rejeitados
  - latência transcode
  - erros vMix dispatch
- Logs estruturados (pino) → Loki (opcional)
- Alerta básico: fila de moderação > X pendentes durante > Y min

---

## 11. Roadmap

### Sprint 0 — Setup local (2–3 dias)
- [ ] VM Debian 12 em Hyper-V no PC de dev (cloud-init básico)
- [ ] Docker + Compose, repo clonado, `docker compose up` a arrancar
- [ ] VS Code Remote-SSH configurado
- [ ] Smoke test: hello-world Next.js + Postgres ligados

### Sprint 1 — MVP (2 semanas)
- [ ] Provisionar 1 VM Debian 12 no Proxmox (qemu-guest-agent, virtio)
- [ ] Instalar Docker + Compose, deploy da `compose.yml`
- [ ] Configurar Cloudflare Tunnel + DNS + Access para `/admin`
- [ ] Pareamento Syncthing entre VM e PC do vMix sobre WG
- [ ] Schema Prisma + migrations base
- [ ] Endpoint upload (sem tus, multipart simples) com Turnstile
- [ ] Página pública mobile-first
- [ ] Worker FFmpeg básico (transcode + thumb)
- [ ] Dashboard operador: lista, preview, aprovar/rejeitar
- [ ] Aprovar = mover/copiar para pasta sync → vMix consome local
- [ ] **Teste num rally real**

### Sprint 2 — Robustez (1–2 semanas)
- [ ] Migrar upload para tus.io (resumível)
- [ ] PWA + Service Worker (background upload)
- [ ] vMix HTTP API com retry/idempotência (apontar a paths locais sincronizados)
- [ ] Crédito on-screen via SPX-GC (`IDENT_contribuidor.html`)
- [ ] WebSocket no dashboard
- [ ] Magic link auth para identificados

### Sprint 3 — Operação (1 semana)
- [ ] NSFW flagging + pHash dedup
- [ ] Notificação "estás no ar" (email + push PWA)
- [ ] Grafana + Prometheus no mesmo compose
- [ ] Cron de purga GDPR (`rejected/` 7d, `raw/` 30d)

### Sprint 4 — Mobile nativo (opcional, condicional)
- [ ] Avaliar dor real da PWA após 2–3 rallys
- [ ] Só avançar com Expo/React Native se houver justificação concreta

---

## 12. Decisões em aberto

Decisões fechadas:

- ✅ **Volume:** ~500 submissões/evento (mix foto+vídeo). Dimensionamento na §2.
- ✅ **vMix remoto via WireGuard.**
- ✅ **Modelo de transporte:** sincronização contínua (Syncthing) sobre WG → ficheiro fica sempre local no PC do vMix antes de ser usado. Modo de consumo (Input List vs player remoto) decidido por peça. Detalhe na §7.
- ✅ **Topologia infra:** 1 VM Debian 12 no Proxmox com Docker Compose (em vez de 5 LXCs separados). Sem MinIO — filesystem chega para este volume. Detalhe na §2.
- ✅ **Dev local:** mesma VM Debian em Hyper-V no PC de desenvolvimento → dev/prod parity.

Questões ainda em aberto:

- **Banda real da VPN WireGuard** entre Proxmox e PC do vMix? — define a estratégia de pasta sincronizada (sincronizar tudo `processed/` vs só `approved/`)
- **Operador da fila = operador do vMix?** — se sim, prioridade ao botão "API send" (1 clique). Se não, basta carregar via Input List.
- **Branding / domínio** — `rally.<canal>.pt`?
- **Quem é o DPO / responsável legal pelos textos de consentimento?**
- **Política sobre clips de acidentes graves** — moderação especial? blackout?

---

## 13. Estrutura de pastas (proposta)

```
rallyshare/
├── projecto.md                 ← este documento
├── compose.yml                 ← stack inteira (dev e prod)
├── compose.prod.yml            ← overrides de prod (volumes, restart, etc.)
├── .env.example
├── apps/
│   ├── api/                    ← NestJS              (Dockerfile)
│   ├── web/                    ← Next.js (público + /admin)
│   └── worker/                 ← FFmpeg consumer    (Dockerfile)
├── packages/
│   ├── db/                     ← Prisma schema + migrations
│   ├── shared/                 ← tipos partilhados, validação zod
│   ├── storage/                ← adapter filesystem (interface trocável p/ S3)
│   └── vmix-client/            ← wrapper HTTP API
├── infra/
│   ├── vm/                     ← cloud-init Debian (Proxmox e Hyper-V)
│   ├── cloudflared/            ← config tunnel
│   └── syncthing/              ← config inicial dos peers
└── docs/
    ├── operator-guide.md
    └── vmix-setup.md
```

Monorepo gerido com **pnpm workspaces** + **Turborepo** (build cache).

---

## 14. Próximo passo concreto

Escolher um destes para arrancar:

1. **Provisionar infra** — escrever cloud-init / Terraform para os LXCs e o tunnel CF
2. **Esqueleto código** — `pnpm create` do monorepo com NestJS + Next.js + Prisma
3. **Prova de conceito vMix** — script standalone que faz upload→transcode→AddInput, para validar o caminho crítico antes de investir em UI

Recomendação: **(3) primeiro**. Se a integração vMix tiver problemas (versão da API, formatos, latência), é melhor descobrir agora do que depois de duas sprints de UI.
