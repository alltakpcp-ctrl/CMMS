# CLAUDE.md — Sistema CMMS de Gestão de Ordens de Serviço

> Este arquivo é o contexto permanente do projeto. Leia-o por inteiro antes de
> mexer em qualquer parte do sistema. Ele descreve stack, regras de negócio,
> modelo de dados, permissões e convenções **do estado atual do código**
> (última revisão: 2026-09-14).
>
> O MVP original (specs `01` a `06` em `/specs`) já foi implementado e
> commitado por inteiro — o projeto evoluiu bem além dele (estoque com fluxo
> de compras, turnos, setores dinâmicos N:N, múltiplos técnicos por OS,
> indicadores avançados, etc.). As specs ficam como registro histórico da
> decisão original; **este documento é a fonte de verdade sobre o que existe
> hoje**. Se encontrar divergência entre uma spec antiga e o código, o código
> (e este arquivo, revisado a partir dele) prevalece.

---

## 1. Visão geral

Aplicação **full-stack** para gestão do ciclo de vida de **Ordens de Serviço (OS)**
de manutenção industrial (um CMMS — *Computerized Maintenance Management System*).

O sistema cobre as 6 etapas do processo de manutenção:

1. **Abertura / Solicitação de Serviço**
2. **Triagem e Planejamento**
3. **Programação (Agendamento)**
4. **Execução do Serviço**
5. **Encerramento Técnico e Validação**
6. **Análise de Indicadores** (MTBF, MTTR, aderência à programação, backlog, ciclo de vida, distribuição, eficiência por técnico)

Tipos de OS: **Corretiva**, **Preventiva**, **Preditiva**, **Melhoria** (esta
última aceita pela API mas sem opção no formulário padrão de abertura —
ver §4). Setores (`Sector`) deixaram de ser um enum fixo: são uma tabela
própria, cadastrável por SUPERVISOR (`/cadastros/setores`), com relação N:N
para `Asset` (`AssetSector`).

Além do ciclo de OS, o sistema também cobre:
- **Almoxarifado com kardex** (`Part`/`StockMovement`) — ver §5.
- **Fluxo de compras**: indicação de peça/ferramenta (`PartRequest`) →
  pedido de compra (`PurchaseOrder`) → revisão do supervisor → compras.
- **Turnos** (`Shift`) — cadastro simples vinculado a `User`, consumido hoje
  só pela tela de edição de usuário.
- **Permissão de Trabalho em altura**: feature **pausada** — ver §5.1.

---

## 2. Stack técnica (obrigatória)

| Camada | Tecnologia |
|---|---|
| Backend | Node.js (LTS) + Express |
| ORM | Prisma |
| Banco (**todos os ambientes**) | **PostgreSQL (Neon)** — dev, teste e produção usam Neon, cada um com seu próprio branch/projeto (ver `.env.example`). A decisão original de MVP (SQLite em dev) foi **abandonada**: `prisma/schema.prisma` fixa `provider = "postgresql"` sem alternância por ambiente. |
| Frontend | React + Vite + Tailwind CSS |
| Auth | JWT (access token) + hash de senha com bcrypt |
| Validação | zod (backend) |
| HTTP client (front) | fetch nativo (wrappers em `frontend/src/api/*`) |
| Datas | `Date` nativo — **dayjs foi removido do projeto por completo**, não há mais nenhuma dependência dele no `frontend/package.json` |

### Decisões de arquitetura vigentes (NÃO reabrir sem necessidade real)
- **Enums = String + validação em TypeScript/zod.** Mesmo agora em Postgres,
  o schema Prisma **não** usa enums nativos do banco — decisão deliberada
  para manter schema idêntico entre ambientes e validação centralizada em
  `backend/src/domain/enums.ts` (valores canônicos) + `src/modules/*/schema.ts`
  (zod). Onde este documento diz "enum", leia "String restrita aos valores de
  `domain/enums.ts`".
- **`DATABASE_URL` de cada ambiente aponta para um Neon diferente.** Nunca
  assumir que rodar localmente é seguro por padrão — **confira sempre o
  `.env` ativo antes de rodar seed, migration ou teste**; já houve incidente
  de `.env` de dev apontando para produção neste projeto (ver memória de
  sessões anteriores). `npm test` usa `TEST_DATABASE_URL`, um branch dedicado
  que sofre `prisma migrate reset` (apaga tudo) — nunca aponte esse env para
  o banco de produção ou de dev.
- **Almoxarifado = controle de estoque com kardex.** Peças têm saldo
  (`stockQty`, cache) e campos de controle (`minStock`, `maxStock`,
  `unitCost`, `location`, `sectorId` opcional, `active`). Toda alteração de
  saldo grava um `StockMovement` (kardex auditável) na MESMA transação, via
  helper `recordStockMovement(tx, input)` — nunca increment/decrement, sempre
  valor absoluto; saldo negativo é bloqueado (422 `INSUFFICIENT_STOCK`). A
  baixa por execução de OS é automática (tipo `SAIDA`). Movimentação manual
  (entrada, ajuste, devolução) é permitida a SUPERVISOR ou a TÉCNICO com a
  flag `canManageStock` (`supervisorOrCanManageStock()`), com `reason`
  obrigatório. **Não** há perfil de almoxarife dedicado — é uma flag no
  `User`, não um role.
- **Preventiva = sem cron/agendador automático.** O vencimento de um
  `MaintenancePlan` é sempre calculado sob demanda (`lib/maintenancePlans.ts`),
  nunca por job em background. Criar um `MaintenancePlan` (TECNICO ou
  SUPERVISOR, via Agenda) **gera a 1ª OS na hora**, já `PROGRAMADA` (pula
  triagem/planejamento — quem agenda já informa data/hora e técnico); ciclos
  seguintes usam `POST /maintenance-plans/:id/gerar-os`. `Asset.preventivePeriodicityDays`
  existe no schema como gancho para um futuro cron, mas **não é lido por
  nenhum código hoje** — não confundir com um mecanismo ativo.

### Decisão de produção (deploy)
- **Projeto Neon atual: "SUP.CMMS"** (host `ep-quiet-rice-a697z5p7`, região
  us-west-2 — o que está em `backend/.env` de produção). Cutover feito em
  2026-08-18 a partir do projeto anterior (host `ep-plain-moon-aw7p7pwz`),
  que estourou cota de compute por um polling que nunca deixava o banco
  dormir (causa raiz já corrigida). O projeto antigo ficou suspenso como
  rollback — **não usar** nenhuma connection string antiga encontrada em
  histórico de commits/specs/memória.
- **Hospedagem:** backend no Render (Web Service Node), frontend no Vercel
  (build estático do Vite), banco no Neon (SUP.CMMS). Deploy automático via
  Git push.

---

## 3. Estrutura de pastas do projeto

```
/
├── CLAUDE.md
├── /specs                 # specs históricas do MVP (00-06) — não refletem o estado atual sozinhas
├── /backend
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── domain/enums.ts        # valores canônicos de todos os campos "String-enum"
│   │   ├── config/                # env, prisma client
│   │   ├── middlewares/           # authenticate, authorize (por role), canManageStock,
│   │   │                          #   canPurchase, canReceivePartRequests, errorHandler
│   │   ├── modules/                # um diretório por domínio:
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── assets/
│   │   │   ├── sectors/
│   │   │   ├── shifts/
│   │   │   ├── parts/
│   │   │   ├── stock/
│   │   │   ├── part-requests/
│   │   │   ├── purchase-orders/
│   │   │   ├── workorders/         # inclui publicController/publicRoutes (quadro público de login)
│   │   │   ├── subtasks/
│   │   │   ├── maintenance-plans/  # planos de preventiva (Agenda)
│   │   │   ├── indicators/
│   │   │   └── permissaoTrabalho/  # SÓ contém perguntas.ts (checklist estático) — sem routes/controller/service, feature pausada (ver §5.1)
│   │   │   └── <mod>/routes.ts, controller.ts, service.ts, schema.ts
│   │   ├── lib/            # helpers puros: workOrderStateMachine, maintenancePlans,
│   │   │                   #   businessDays, indicators, workOrderNumber, purchaseOrderNumber,
│   │   │                   #   assignees (resolveAssigneeIds), AppError, publicUser
│   │   ├── app.ts           # monta todos os routers (fonte de verdade dos prefixos de rota)
│   │   └── server.ts
│   ├── .env.example
│   └── package.json
└── /frontend
    ├── src/
    │   ├── api/                # wrappers fetch por módulo, espelham os endpoints do backend
    │   ├── auth/                # AuthContext, RequireAuth, RequireRole, RequireFlag
    │   ├── components/          # UI reutilizável (Button, Modal, Table, Badge, ToastProvider, MultiSearchableSelect...)
    │   ├── pages/
    │   │   ├── Agenda.tsx, Dashboard.tsx, FilaTriagem.tsx, Indicadores.tsx,
    │   │   │   ListaOS.tsx, Login.tsx, MaintenancePlanModal.tsx, MinhasOS.tsx,
    │   │   │   NovaSolicitacao.tsx
    │   │   ├── agenda/          # calendário de preventivas + programação (ver §6.1)
    │   │   ├── cadastros/       # Ativos.tsx, Setores.tsx, Usuarios.tsx (SUPERVISOR-only)
    │   │   ├── estoque/         # Estoque.tsx
    │   │   ├── indicators/      # BacklogChart, PhaseDurationChart, TechnicianEfficiencyPanel
    │   │   ├── pedidos/         # MontarPedido, RevisaoPedidos, Compras
    │   │   └── workorders/      # DetalheOS.tsx + actions/ (um form por transição) + subtasks/
    │   ├── hooks/               # ex.: useTecnicos()
    │   ├── domain/enums.ts, labels.ts   # espelham backend/src/domain/enums.ts + rótulos/cores pt-BR
    │   ├── lib/                 # calendar.ts, format.ts, errors.ts
    │   ├── App.tsx              # fonte de verdade das rotas + guards (RequireRole/RequireFlag)
    │   └── main.tsx
    ├── index.html
    └── package.json
```

---

## 4. Perfis de usuário e permissões

### Roles (`Role` em `domain/enums.ts`)
`OPERADOR`, `TECNICO`, `SUPERVISOR`, `SEGURANCA`.

`SEGURANCA` existe no enum e pode ser atribuído a um `User` (tela de
usuários), mas **nenhuma rota/middleware `authorize()` o menciona hoje** —
na prática um usuário `SEGURANCA` não acessa nenhuma tela protegida por role.
É um role reservado para uma funcionalidade futura (provavelmente ligada à
Permissão de Trabalho, §5.1), não uma permissão ativa — não assumir que ele
já dá acesso a algo sem verificar `authorize()` no módulo em questão.

### Flags booleanas no `User` (permissão pontual, não um role)
Além do role, `User` tem três flags independentes que liberam ações
específicas via middleware dedicado (não via `authorize(role)`):
- `canManageStock` — movimentar estoque manualmente (`supervisorOrCanManageStock()`), mesmo gate de SUPERVISOR.
- `canReceivePartRequests` — montar pedido de compra a partir de indicações pendentes, rejeitar indicação avulsa (`canReceivePartRequests()`); rota `/pedidos/montar` no front.
- `canPurchase` — atuar na etapa de compras de um pedido já revisado pelo supervisor (`canPurchase()`); rota `/pedidos/compras` no front.

### Tabela de permissões por etapa/ação

| Ação / Etapa | OPERADOR | TECNICO | SUPERVISOR |
|---|:--:|:--:|:--:|
| (1) Abrir solicitação | ✅ | ❌ | ✅ |
| (2) Triagem / priorização | ❌ | ✅ | ✅ |
| (2) Planejamento (peças, ferramentas, procedimentos) | ❌ | ✅ | ✅ |
| (3) Programação de OS corretiva/preditiva (rota real só aceita SUPERVISOR — ver nota) | ❌ | ❌ | ✅ |
| (3) Reprogramar (trocar técnico/reagendar sem mudar status) | ❌ | ❌ | ✅ (endpoint existe, **sem UI no frontend hoje** — ver §6.1) |
| Agenda de preventivas: criar plano (gera 1ª OS) / gerar novo ciclo | ❌ | ✅ | ✅ |
| Editar/desativar/excluir plano de preventiva existente | ❌ | ❌ | ✅ |
| (4) Executar e registrar reparo | ❌ | ✅ (o assignedTo/apoio) | ✅ (isento da checagem de assignedTo) |
| (5) Encerramento técnico | ❌ | ✅ | ✅ |
| (5) Validar e dar baixa na OS / reprovar validação | ❌ | ❌ | ✅ |
| Cancelar OS (qualquer status ≠ ENCERRADA, nota obrigatória) | ❌ | ❌ | ✅ |
| Override manual de fase (`PATCH /:id/timeline`, pula a máquina de estados) | ❌ | ❌ | ✅ |
| Subtarefas: abrir | ❌ | ✅ | ✅ |
| Subtarefas: fechar/cancelar/reatribuir | ❌ | 🔒 só se dono (`assignedToId`) | ✅ qualquer uma |
| (6) Ver indicadores | ❌ (fora do endpoint) | ✅ | ✅ |
| Cadastros (ativos, setores, usuários) | ❌ | ❌ | ✅ |
| Cadastro de peças (criar/editar/excluir) | ❌ | 🔓 com `canManageStock` | ✅ |
| Estoque (consulta) | ❌ | ✅ | ✅ |
| Pedidos de compra — montar a partir de indicações | ❌ | 🔓 com `canReceivePartRequests` | 🔓 com `canReceivePartRequests` |
| Pedidos de compra — revisar (`/pedidos/revisao`) | ❌ | ❌ | ✅ |
| Pedidos de compra — comprar (`/pedidos/compras`) | ❌ | 🔓 com `canPurchase` | 🔓 com `canPurchase` |

Notas importantes:
- O middleware de RBAC bloqueia no backend **independentemente** do que o
  frontend exibe. O frontend só oculta o que o usuário não pode fazer —
  mas já existe pelo menos um caso de divergência **inofensiva** entre os
  dois: `POST /:id/programacao` autoriza `TECNICO` e `SUPERVISOR` na rota
  (`workorders/routes.ts`), mas `workOrderStateMachine.ts` só lista
  `roles: [SUPERVISOR]` para a transição `PLANEJADA → PROGRAMADA` — um
  TECNICO que chamasse essa rota receberia `403 ROLE_FORBIDDEN` na prática.
  O frontend já reflete a regra real (só oferece "Programar" a SUPERVISOR em
  `DetalheOS.tsx#getAvailableActions`). Não tratar isso como bug a corrigir
  sem confirmar a intenção — pode ser rota deliberadamente mais permissiva
  para uso futuro.
- TECNICO **não abre** solicitação — apenas responde a partir da triagem.
- Em qualquer prioridade, a OS pode ir direto de `TRIAGEM` ou `PLANEJADA` para
  `EM_EXECUCAO` pelo próprio técnico (auto-atribuído), sem passar pela
  programação do SUPERVISOR (ver §6 e `workOrderStateMachine.ts`).
- Criar um `MaintenancePlan` (Agenda) é liberado a TECNICO **e** SUPERVISOR —
  única exceção onde TECNICO participa da etapa (3), porque a ação já embute
  agendamento completo (data/hora + técnico) e gera a OS na hora, `PROGRAMADA`.

---

## 5. Modelo de dados

Entidades e campos essenciais (ver `backend/prisma/schema.prisma` para a
fonte exata — nomes de coluna em camelCase).

### User
`id`, `name`, `email` (único), `passwordHash`, `role`, `sectorId` (→ Sector,
opcional), `shiftId` (→ Shift, opcional), `canReceivePartRequests`,
`canManageStock`, `canPurchase` (flags, default `false`), `active`, `createdAt`.

### Sector (setor — não é mais enum fixo)
`id`, `name` (único), `active`, `createdAt`, `updatedAt`. Relacionado a
`Asset` via `AssetSector` (N:N — visibilidade real do ativo), a `User`
(setor primário do usuário), a `Part` (setor da peça) e a `WorkOrder.targetSectorId`
(setor de destino definido na triagem). `Asset.sectorId` continua existindo
como setor primário, mas é `@deprecated` como fonte de verdade de
visibilidade — usar `AssetSector`.

### Shift (turno)
`id`, `name` (único), `startTime`/`endTime` (string `"HH:mm"`), `active`,
`createdAt`. Só consumido hoje pela edição de usuário; sem lógica de negócio
própria (não afeta programação/agenda).

### Asset (Ativo)
`id`, `code` (único), `name`, `sectorId` (setor primário, deprecated — ver
acima), `location`, `criticality` (int 1–5), `preventivePeriodicityDays`
(int, opcional — **campo não lido por nenhum código hoje**, gancho para um
futuro cron que não existe), `active`, `createdAt`.

### Part (Peça / item de almoxarifado)
`id`, `code` (único), `description`, `unit`, `stockQty` (cache), `minStock`?,
`maxStock`?, `unitCost`?, `location`?, `sectorId`? (→ Sector),
`stockStatusOverride`?, `active` (default `true`), `createdAt`, `updatedAt`.

### WorkOrder (OS)
`id`, `number` (única, auto-gerada — §7), `type` (CORRETIVA | PREVENTIVA |
PREDITIVA | MELHORIA), `status` (§6), `priority` (BAIXA/MEDIA/ALTA/URGENTE),
`title`, `description`, `requesterId` (→ User), `assetId` (→ Asset),
`disciplina` (MECANICA/ELETRICA/PREDIAL, default `ELETRICA`),
`trabalhoEmAltura` (bool, definido na triagem — **flag informativa, sem
gate/bloqueio ativo hoje**, ver §5.1), `targetSectorId` (→ Sector, definido
na triagem), `plan`?, `estimatedHours`? (obrigatório só para PREVENTIVA na
programação), `tools`?/`ppe`? (JSON), `scheduledStart`?/`scheduledEnd`?,
`assignedToId` (→ User, responsável principal), `maintenancePlanId` (→
MaintenancePlan, preenchido quando gerada pela Agenda ou por um plano
rascunho), `priorityAdjustedByTech`/`priorityOriginal`/`priorityAdjustedById`/`priorityAdjustedAt`
(auditoria de ajuste de prioridade feito pelo técnico na triagem),
`createdAt`, `updatedAt`.
- `numMaintainers` (Int?), `safetyEquipment` (String?) e `plannedParts`
  (Json?) são **`@deprecated`** no schema — mantidos só para não quebrar
  dados antigos; a API não os aceita mais diretamente. Manutentores de apoio
  vêm de `WorkOrderAssignee`, EPI de `ppe`, peças planejadas de
  `WorkOrderPlannedPart`.

### WorkOrderAssignee (manutentores de apoio — N:N)
`id`, `workOrderId`, `userId`, `createdAt`. `@@unique([workOrderId, userId])`.
`WorkOrder.assignedToId` continua sendo o responsável **principal** (1:1);
esta tabela é só apoio. Preenchida em `planejamento()`, `iniciar()` e
`programacao()` — **atenção**: os dois primeiros **substituem** a lista
inteira (`deleteMany` + `create`); `programacao()` (e `generateWorkOrderFromPlan`
da Agenda) **acrescenta** (`createMany` + `skipDuplicates`), nunca substitui.
São semânticas diferentes por decisão explícita do time — não unificar sem
confirmar.

### MaintenancePlan (plano de preventiva — agenda recorrente por ativo)
`id`, `assetId` (→ Asset), `discipline`, `title`, `description`?, `priority`,
`periodicity`? (DIARIO/SEMANAL/MENSAL/TRIMESTRAL/SEMESTRAL/ANUAL — `null` =
plano "rascunho", criado automaticamente quando um OPERADOR abre uma OS
PREVENTIVA sem que exista plano prévio para o ativo), `estimatedHours`?
(obrigatório ao criar o plano pela Agenda), `responsible`?, `action01`..`action06`
(checklist), `active` (default `true`), `createdAt`, `updatedAt`.
- Vencimento calculado sob demanda (`lib/maintenancePlans.ts`), nunca por
  cron — próxima data = `finishedAt` da última `Execution` **encerrada**
  (isto é, `WorkOrder.status === ENCERRADA`, não apenas `finishedAt`
  preenchido — um ciclo reprovado na validação também tem `finishedAt`, mas
  não conta) vinculada a este plano, ou `MaintenancePlan.createdAt` se nunca
  executado, + dias da periodicidade, ajustado para o próximo dia útil
  (`businessDays.ts`). Plano rascunho não tem vencimento.
- **Criar um plano gera a 1ª OS na hora**, já `PROGRAMADA` — `POST
  /maintenance-plans` exige também `scheduledStart`/`scheduledEnd`/`assigneeIds`
  só para essa geração, não persistidos no plano. Ciclos seguintes usam
  `POST /maintenance-plans/:id/gerar-os`, bloqueado (`409
  PLAN_HAS_OPEN_WORK_ORDER`) enquanto existir uma OS do plano em status fora
  de `ENCERRADA`/`CANCELADA`.

### Execution (registro de execução — 1:N com WorkOrder)
`id`, `workOrderId` (→ WorkOrder, sem unique — uma OS pode ter mais de um
ciclo), `riskAnalysis`?, `startedAt`?, `finishedAt`?, `testNotes`?,
`cleanupDone` (bool), `startedById`/`startedBy` (→ User), `endedById`/`endedBy`
(→ User), `startNote`?, `endNote`?, `outcome`? (CONCLUIDA | INTERROMPIDA |
PAUSA_TURNO). `rootCause`/`repairDescription` são **`@deprecated`** — registro
legado pré-`ExecutionLog`, mantido só como primeira entrada histórica exibida
na UI.
- `logs` (→ `ExecutionLog[]`) — histórico de causa raiz + reparo dentro do
  mesmo ciclo; cada chamada a `registrar()` cria uma entrada nova em vez de
  sobrescrever os campos legados acima.

### Subtask (subtarefa dentro da OS — ortogonal a Execution)
`id`, `workOrderId` (→ WorkOrder, `onDelete: Cascade`), `title`, `description`?,
`estimatedHours` (obrigatório na abertura), `createdById` (→ User),
`assignedToId` (→ User, obrigatório — dono atual), `openedAt` (imutável,
`now()` do servidor), `closedAt`? (preenchido em CONCLUIDA **e** CANCELADA),
`closedById`? (→ User), `createdAt`, `updatedAt`. `finishedAt` é
**`@deprecated`** (só CONCLUIDA, substituído por `closedAt`/`closedById`).
- `status`: `ABERTA` (default) → `CONCLUIDA` | `CANCELADA`, só a partir de `ABERTA`.
- **Hard-block:** a OS não pode ir para `AGUARDANDO_VALIDACAO` nem
  `ENCERRADA` enquanto houver subtask `ABERTA` — `422 HAS_OPEN_SUBTASKS`,
  checado em `workorders/service.ts#applyTransition` antes de ambas as
  transições (defesa em profundidade: cobre tanto o encerramento técnico
  quanto a validação do supervisor).
- **Ownership guard** (checado no service, não em middleware): TECNICO só
  fecha/cancela/reatribui a subtask onde é `assignedToId`; SUPERVISOR pode em
  qualquer uma. Violação → `403 SUBTASK_FORBIDDEN`. Abrir é livre para
  TECNICO/SUPERVISOR.

### WorkOrderPart / WorkOrderPlannedPart
`WorkOrderPart` = peças efetivamente usadas na execução (baixa via
`recordStockMovement`, tipo `SAIDA`). `WorkOrderPlannedPart` = peças
planejadas na etapa 2 (sem baixa de estoque ainda).

### StockMovement (kardex / livro-razão de estoque)
`id`, `partId` (→ Part), `type` (ENTRADA | SAIDA | AJUSTE | DEVOLUCAO),
`quantity` (sempre positivo), `balanceAfter`, `unitCost`?, `workOrderId`?,
`partRequestId`? (→ PartRequest), `userId` (→ User), `reason`?,
`statusSnapshot`?, `orderRef`?, `createdAt`. Índice em `(partId, createdAt)`.

### PartRequest (indicação de peça/ferramenta — início do fluxo de compras)
`id`, `itemType` (PECA | FERRAMENTA), `partId`? (→ Part, se já cadastrada),
`description`, `quantity`, `notes`?, `status` (PENDENTE | INCLUIDA |
REJEITADA | DEVOLVIDA | ATENDIDA), `osId`? (→ WorkOrder, indicação feita a
partir de uma OS), `assetId`?, `criticality`?, `supplierName`?,
`requestedById` (→ User), `purchaseOrderId`? (→ PurchaseOrder, quando
incluída num pedido), `rejectedReason`?, `createdAt`, `updatedAt`.

### PurchaseOrder / PurchaseOrderComment (pedido de compra)
`PurchaseOrder`: `id`, `number` (única — §7), `status` (EM_ANALISE | APROVADO
| APROVADO_PARCIAL | DEVOLVIDO | REJEITADO | ENVIADO_COMPRAS), `createdById`
(→ User, quem montou), `reviewedById`?/`reviewedAt`?/`reviewNotes`? (revisão
do SUPERVISOR), `items` (→ PartRequest[]), `parentPurchaseOrderId`? (→
PurchaseOrder, para pedidos derivados/reenviados), `createdAt`, `updatedAt`.
`PurchaseOrderComment`: discussão por pedido (`authorId`, `body`,
`supplierName`?, `createdAt`).

### StatusHistory (auditoria de transições)
`id`, `workOrderId` (→ WorkOrder), `fromStatus`?, `toStatus`, `changedById`
(→ User), `note`?, `changedAt`. **Toda** transição de status DEVE gerar um
registro aqui — é a base dos indicadores. `reprogramacao()` também escreve
aqui (com `fromStatus === toStatus`) só para manter rastro de auditoria, já
que não muda o status da OS.

### 5.1 — Permissão de Trabalho em altura (feature pausada, não remover sem confirmar)
O schema Prisma ainda tem os modelos `PermissaoTrabalho`,
`PermissaoTrabalhoResposta` e `PermissaoTrabalhoAssinatura` (fluxo completo:
RASCUNHO → PREENCHIDA → AGUARDANDO_APROVACAO → APROVADA/REPROVADA →
AGUARDANDO_ASSINATURAS → LIBERADA → ENCERRADA), e `WorkOrder.trabalhoEmAltura`
continua sendo definido na triagem. **Porém o backend ativo do módulo foi
removido** (commit `chore(pt): remover backend da Permissão de Trabalho e
liberar guard de altura`) — `backend/src/modules/permissaoTrabalho/` hoje só
contém `perguntas.ts` (o checklist estático de perguntas sobre trabalho em
altura), sem `routes.ts`/`controller.ts`/`service.ts`, e `app.ts` não monta
nenhuma rota para esse módulo. Não há mais gate bloqueando início de OS de
altura sem PT aprovada. Se for pedido para reativar esse fluxo, tratar como
feature nova a reconstruir (os modelos de dados já existem, mas a lógica de
service/rotas precisa ser recriada), não como bug a corrigir.

---

## 6. Máquina de estados da OS

Enum `WorkOrderStatus`:

```
ABERTA → TRIAGEM → PLANEJADA → PROGRAMADA → EM_EXECUCAO → AGUARDANDO_VALIDACAO → ENCERRADA
```

Transição adicional: qualquer status (exceto ENCERRADA/CANCELADA) pode ir
para `CANCELADA` (somente SUPERVISOR, com nota obrigatória).

### Regras de transição

| De | Para | Quem | Efeito colateral |
|---|---|---|---|
| — | ABERTA | OPERADOR/SUPERVISOR | cria OS, gera `number` |
| ABERTA | TRIAGEM | TECNICO/SUPERVISOR | define priority + targetSectorId + trabalhoEmAltura |
| TRIAGEM | PLANEJADA | TECNICO/SUPERVISOR | preenche `plan`, tools/ppe, peças planejadas, substitui `assignees` de apoio |
| PLANEJADA | PROGRAMADA | SUPERVISOR | exige scheduledStart/End + ≥1 assigneeId (1º = principal); tempo estimado obrigatório só se PREVENTIVA; acrescenta `assignees` de apoio (não substitui) |
| TRIAGEM | EM_EXECUCAO | TECNICO | atalho: pula a programação do supervisor (qualquer prioridade) |
| PLANEJADA | EM_EXECUCAO | TECNICO | mesmo atalho, quando já houve planejamento |
| PROGRAMADA | EM_EXECUCAO | TECNICO (assignedTo ou apoio) | cria Execution, `startedAt = now()`, registra `startedById`/`startNote` |
| EM_EXECUCAO | AGUARDANDO_VALIDACAO | TECNICO (assignedTo ou apoio) | preenche registro/peças; `finishedAt = now()`; **bloqueado** por `422 HAS_OPEN_SUBTASKS` se houver subtask ABERTA |
| AGUARDANDO_VALIDACAO | ENCERRADA | SUPERVISOR | valida e dá baixa; **mesmo bloqueio** de subtask aberta |
| AGUARDANDO_VALIDACAO | EM_EXECUCAO | SUPERVISOR | reprova validação, nota obrigatória, reabre Execution |
| qualquer (≠ ENCERRADA/CANCELADA) | CANCELADA | SUPERVISOR | nota obrigatória |

- Transições fora dessa tabela são **rejeitadas** com `409`/`422`.
- Implementada como função pura em `lib/workOrderStateMachine.ts#canTransition`
  (statusAtual, statusDestino, role, contexto) → válido/inválido + código de
  erro. `workorders/service.ts#applyTransition` chama essa função antes de
  persistir, dentro de uma `$transaction` que também grava `StatusHistory`.
- **Override manual** (`PATCH /:id/timeline`, SUPERVISOR): move a OS para
  qualquer status, **fora** de `canTransition` — inclusive para/de
  ENCERRADA/CANCELADA. Único caminho que ignora a máquina de estados por
  design.
- **Reprogramação** (`PATCH /:id/programacao`, SUPERVISOR): **não** é uma
  transição de status — troca `assignedToId`/`scheduledStart`/`scheduledEnd`
  a qualquer momento (exceto OS ENCERRADA/CANCELADA), registrando uma
  `StatusHistory` com `fromStatus === toStatus`. Implementada em
  `workorders/service.ts#reprogramacao`, mas **sem função correspondente em
  `frontend/src/api/workorders.ts` nem botão em `DetalheOS.tsx`** — endpoint
  funcional, mas sem qualquer forma de acioná-lo pela UI hoje.

### 6.1 — Agenda: as 3 telas e onde cada ação mora

A "Agenda" não é uma tela única — são três rotas distintas, todas guardadas
por `RequireRole` em `App.tsx`:

- **`/agenda`** (SUPERVISOR) → `Agenda.tsx` → `agenda/MaintenanceCalendar.tsx`:
  calendário mês/semana/dia dos `MaintenancePlan` (preventivas). Traz
  popover de evento (`MaintenancePlanEventPopover`), filtros por
  ativo/prioridade (`CalendarSidebarFilters`), criação/edição de plano
  (`MaintenancePlanModal.tsx`, gera a 1ª OS) e "Gerar OS" para ciclos
  seguintes (`agenda/GerarOsForm.tsx` → `POST /maintenance-plans/:id/gerar-os`).
  Planos rascunho (`periodicity = null`) aparecem numa lista separada, fora
  da grade do calendário, até o supervisor completar a periodicidade.
- **`/agenda/programacao`** (SUPERVISOR) → `agenda/AgendaProgramacao.tsx`:
  só duas listas (OS `PLANEJADA` a programar / OS `PROGRAMADA`), **sem**
  formulário embutido — clicar na linha navega para `/ordens/:id`. O
  formulário real de programação (`ProgramacaoForm.tsx`, ação "Programar" em
  `DetalheOS.tsx`) só aparece lá quando a OS está `PLANEJADA` e o usuário é
  SUPERVISOR.
- **`/preventivas`** (TECNICO) → `agenda/PreventivasTecnico.tsx`: reaproveita
  o mesmo `MaintenanceCalendar` (TECNICO também cria plano/gera OS, ver §4)
  mais uma lista "minhas OS preventivas programadas" (`PROGRAMADA`/`EM_EXECUCAO`,
  como principal ou apoio).

---

## 7. Regra de numeração

- **OS:** `OS-YYYY-NNNNNN` (ano corrente + sequência zero-padded de 6
  dígitos, reinicia a cada ano). `lib/workOrderNumber.ts`, chamado sempre
  dentro de uma transação (consulta o maior número do ano + 1).
- **Pedido de compra:** `PC-YYYY-NNNNNN`, mesmo padrão.
  `lib/purchaseOrderNumber.ts`.

---

## 8. Indicadores (módulo `indicators`, acesso TECNICO + SUPERVISOR — OPERADOR fica de fora por serem agregados cross-setor)

Endpoints (`GET /indicators/...`), todos calculados a partir de
`StatusHistory`/`Execution`/`WorkOrder`, filtráveis por período
(`indicatorsQuerySchema`):

- **`/overview`** — MTTR médio, MTBF médio, % de aderência à programação e
  total de backlog, agregados.
- **`/by-asset`** — mesmas métricas (MTTR/MTBF) quebradas por ativo.
- **`/backlog`** — contagem de OS em `PROGRAMADA` e status anteriores,
  agrupável por setor/prioridade.
- **`/lifecycle`** — duração média por fase da OS (`phaseDurations`) e
  throughput (OS concluídas por período).
- **`/distribution`** — distribuição de OS por categoria (tipo/prioridade/
  setor) e tendência ao longo do tempo.
- **`/technician-efficiency`** — métricas por técnico (usa também o tipo
  `MELHORIA`, além dos 3 tipos principais).

Fórmulas exatas (MTTR = média de `Execution.finishedAt − Execution.startedAt`
das OS encerradas por ativo; MTBF = tempo total observado − tempo total em
reparo ÷ nº de falhas corretivas; aderência = OS iniciadas dentro da janela
`scheduledStart` ÷ OS programadas) estão documentadas em
`backend/src/lib/indicators.ts` — checar lá antes de alterar qualquer cálculo.

---

## 9. Convenções de código

- TypeScript em backend e frontend.
- Nomes de variáveis/comentários podem ser em português; nomes de
  tabelas/campos Prisma em camelCase inglês (consistência com o ORM).
- Erros da API em formato: `{ "error": { "code": string, "message": string } }`.
- Status HTTP: 400 validação, 401 sem auth, 403 sem permissão, 404 não
  encontrado, 409/422 transição ou estado inválido.
- Nunca retornar `passwordHash` em respostas.
- Variáveis sensíveis em `.env` (`JWT_SECRET`, `DATABASE_URL`,
  `TEST_DATABASE_URL`). Fornecer `.env.example` sempre que uma nova variável
  for adicionada.
- Campos `@deprecated` no schema (`numMaintainers`, `safetyEquipment`,
  `plannedParts` em `WorkOrder`; `rootCause`/`repairDescription` em
  `Execution`; `finishedAt` em `Subtask`) existem só para não quebrar dados
  antigos — não voltar a escrevê-los diretamente em código novo.
- Commits pequenos e descritivos ao fim de cada tarefa relevante.

---

## 10. Como usar este documento em novas tarefas

1. Este arquivo descreve o estado **atual** do código (revisado por leitura
   direta do repositório, não das specs). As specs em `/specs` são histórico
   do MVP e podem estar desatualizadas — não usá-las como referência sem
   cruzar com o código.
2. Antes de alterar uma área específica (ex.: Agenda/Programação,
   Estoque/Compras, Indicadores), reler a seção correspondente aqui **e**
   confirmar contra o código atual (`domain/enums.ts`, `schema.prisma`,
   `routes.ts` do módulo) — este documento pode ficar defasado de novo à
   medida que o projeto evolui.
3. Ao concluir uma alteração relevante neste sistema, **atualizar este
   CLAUDE.md** na mesma tarefa (ou logo em seguida) para refletir o novo
   comportamento — é assim que ele continua servindo como fonte de verdade,
   em vez de virar uma segunda spec desatualizada.
4. Sempre que criar/alterar o schema, rodar migração e atualizar o seed
   (`prisma/seed.ts`). Lembrar que `DATABASE_URL` de dev aponta para um Neon
   real (não descartável) — confirmar o ambiente antes de rodar
   `migrate dev`/`migrate reset`.
5. Garantir que `npm run dev` (back e front) sobe sem erros antes de
   encerrar a tarefa.
