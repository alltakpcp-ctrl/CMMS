# CLAUDE.md — Sistema CMMS de Gestão de Ordens de Serviço

> Este arquivo é o contexto permanente do projeto. Leia-o por inteiro antes de
> mexer em qualquer parte do sistema. Ele descreve stack, regras de negócio,
> modelo de dados, permissões e convenções **do estado atual do código**
> (última revisão: 2026-09-17).
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
  valor absoluto; saldo negativo é bloqueado (422 `INSUFFICIENT_STOCK`).
  Movimentação manual (entrada, ajuste, devolução) é permitida a SUPERVISOR
  ou a TÉCNICO com a flag `canManageStock` (`supervisorOrCanManageStock()`),
  com `reason` obrigatório. **Não** há perfil de almoxarife dedicado — é uma
  flag no `User`, não um role.
- **Dashboard do estoque** (`GET /stock/dashboard`, TECNICO/SUPERVISOR — mesmo
  gate de `/stock/low-stock` e `/stock/ledger/:partId`) agrega, a partir de
  `Part`/`StockMovement`/`WorkOrder`: contagem/saldo por `StockStatus`, saldo
  por armário (`stock/service.ts#extractArmario` faz parsing do prefixo
  "Armário X" do texto livre de `Part.location`, gerado por
  `scripts/import-parts-controle.ts` — peças com outro formato de localização
  ou sem localização caem em "Sem armário"), top 10 ativos que mais consomem
  peças (cada `StockMovement` SAIDA sempre tem `workOrderId` preenchido —
  `StockWithdrawalRequest.workOrderId` é obrigatório — e `WorkOrder.assetId`
  também é obrigatório, então dá pra atrelar consumo de peça ao ativo sem
  campo novo no schema; cada ativo do ranking já vem com sua peça mais
  consumida embutida, não só o total), top 20 peças mais consumidas (soma de
  `StockMovement` tipo SAIDA, que só existe após aprovação de uma
  `StockWithdrawalRequest` — não inclui `AJUSTE` de baixa manual) e peças
  "sem giro" (saldo > 0 sem nenhuma SAIDA nos últimos 90 dias, constante
  `DEAD_STOCK_DAYS`). Consumido pela aba "Dashboard" de `Estoque.tsx`
  (`pages/estoque/EstoqueDashboard.tsx`), aba padrão ao abrir `/estoque`.
- **Consumo de peças = declaração obrigatória + aprovação, não baixa direta.**
  Ao encerrar tecnicamente uma OS (`encerramentoTecnico`) ou concluir uma
  subtarefa (`finishSubtask`), o técnico é obrigado a declarar peças usadas
  (`parts`) ou marcar `partsNotApplicable` — o schema zod rejeita (400) se
  nenhum dos dois vier preenchido. Essa declaração cria um
  `StockWithdrawalRequest` (`stock-withdrawals/service.ts#createWithdrawalRequest`),
  dentro da MESMA transação da transição/conclusão — não existe caminho para
  encerrar sem declarar. Quando `notApplicable`, a request já nasce
  `APROVADA` (nada a revisar). Quando há itens, nasce `PENDENTE` e só
  debita o estoque de fato (`recordStockMovement`, cria `WorkOrderPart`)
  quando alguém com `canManageStock` aprova via
  `POST /stock-withdrawals/:id/review` (aba "Aprovações de baixa" em
  `/estoque`) — rejeitar não debita, só grava o motivo. A checagem de saldo
  insuficiente (`422 INSUFFICIENT_STOCK`) acontece nesse momento de
  aprovação, não na declaração. A OS/subtarefa segue seu fluxo normal
  (encerra/valida) independente do status da aprovação — são assíncronos.
- **Preventiva = sem cron/agendador automático.** O vencimento de um
  `MaintenancePlan` é sempre calculado sob demanda (`lib/maintenancePlans.ts`),
  nunca por job em background. Criar um `MaintenancePlan` (TECNICO ou
  SUPERVISOR, via Agenda) **gera a 1ª OS na hora**, já `PROGRAMADA` (pula
  triagem/planejamento — quem agenda já informa data/hora e técnico); ciclos
  seguintes usam `POST /maintenance-plans/:id/gerar-os` (manual) **ou** são
  gerados sozinhos ao encerrar o ciclo anterior, se o plano vinculado estiver
  `active` e com `periodicity` definida — ver "Indicador de periodicidade"
  logo abaixo. `Asset.preventivePeriodicityDays` existe no schema como gancho
  para um futuro cron, mas **não é lido por nenhum código hoje** — não
  confundir com o mecanismo acima (que é orientado a evento, não a polling).
- **Indicador de periodicidade + replicação automática na Agenda.** A
  periodicidade de um `MaintenancePlan` não é definida só na Agenda: TECNICO
  ou SUPERVISOR também podem defini-la/atualizá-la na **Triagem** de uma OS
  PREVENTIVA (`POST /:id/triagem`, campo opcional `periodicity` —
  `workorders/service.ts#triagem`), já que todo `WorkOrder` PREVENTIVA sempre
  tem um `maintenancePlanId` vinculado (rascunho ou plano ativo, ver
  `createWorkOrder`). Quando esse plano está `active` e com `periodicity`
  preenchida, encerrar (validar aprovando) qualquer OS PREVENTIVA vinculada a
  ele dispara `workorders/service.ts#autoGenerateNextPreventiveCycle`: gera
  sozinho o próximo ciclo (mesma função `generateWorkOrderFromPlan`, hoje em
  `lib/generateWorkOrderFromPlan.ts`, usada também pelo "Gerar OS" manual),
  repetindo o(s) mesmo(s) técnico(s) (responsável + apoio) e a mesma duração
  (`scheduledEnd − scheduledStart`) do ciclo que fechou, com a data de início
  calculada por `calculateNextDueDate`. Roda depois que a transição para
  `ENCERRADA` já commitou (efeito colateral pós-commit, com erros só
  logados) — uma falha na geração automática nunca bloqueia o encerramento
  em si. `lib/workOrderInclude.ts` e `lib/generateWorkOrderFromPlan.ts`
  existem à parte de `workorders/service.ts` e `maintenance-plans/service.ts`
  justamente para os dois módulos poderem compartilhar essa função sem
  criar import circular entre eles.

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
│   │   │   ├── stock-withdrawals/  # fila de aprovação de baixa (canManageStock) — ver §2
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
│   │   │                   #   assignees (resolveAssigneeIds), AppError, publicUser,
│   │   │                   #   workOrderInclude, generateWorkOrderFromPlan (compartilhados
│   │   │                   #   entre workorders/ e maintenance-plans/ sem import circular)
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
    │   │   ├── estoque/         # Estoque.tsx (aba "Dashboard" = EstoqueDashboard.tsx)
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
| Excluir OS (só `ABERTA`, motivo obrigatório — §5.2) | ❌ | ❌ | ✅ |
| Ver Baú (`GET /workorders/bau` — OS cancelada + excluída, §5.2) | ❌ | ❌ | ✅ |
| Override manual de fase (`PATCH /:id/timeline`, pula a máquina de estados) | ❌ | ❌ | ✅ |
| Subtarefas: abrir | ❌ | ✅ | ✅ |
| Subtarefas: fechar/cancelar/reatribuir | ❌ | 🔒 só se dono (`assignedToId`) | ✅ qualquer uma |
| (6) Ver indicadores | ❌ (fora do endpoint) | ✅ | ✅ |
| Cadastros (ativos, setores, usuários) | ❌ | ❌ | ✅ |
| Cadastro de peças (criar/editar/excluir) | ❌ | 🔓 com `canManageStock` | ✅ |
| Estoque (consulta) | ❌ | ✅ | ✅ |
| Aprovar/rejeitar baixa de estoque (aba "Aprovações de baixa") | ❌ | 🔓 com `canManageStock` | ✅ |
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
- `excludedAt`/`excludedById`/`excludedBy`/`exclusionReason` — colunas de
  **exclusão lógica**, adicionadas pela migração
  `20260917115159_add_work_order_exclusion` e preenchidas por `POST
  /workorders/:id/excluir` (Fases 1 e 2 de 9 do plano — ver §5.2). **Ainda
  não há filtro de indicador/listagem nem tela usando esses campos** (Fases
  3+). Não confundir com `cancelar()`/`CANCELADA`, que já existe e continua
  sendo o caminho para qualquer OS que já saiu da fase inicial.

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
- `excludedAt`/`excludedById`/`excludedBy`/`exclusionReason` — mesma exclusão
  lógica descrita acima para `WorkOrder`, aplicada em cascata (dentro de
  `POST /workorders/:id/excluir`) quando a OS que originou este plano
  rascunho é excluída e nenhuma outra OS não-excluída ainda aponta pra ele
  (ver §5.2).

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
  Concluir (`finishSubtask`) exige declarar consumo de peças (`parts` ou
  `partsNotApplicable`, mesma regra da OS — ver §2), criando uma
  `StockWithdrawalRequest` vinculada via `subtaskId`; cancelar não exige.
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
`WorkOrderPart` = peças efetivamente usadas, criado somente quando a
`StockWithdrawalRequest` correspondente é APROVADA (ver abaixo) — não mais
criado direto no encerramento técnico. `WorkOrderPlannedPart` = peças
planejadas na etapa 2 (sem baixa de estoque, sem relação com a aprovação).

### StockWithdrawalRequest / StockWithdrawalRequestItem (solicitação de baixa)
Criada obrigatoriamente ao encerrar tecnicamente uma OS ou concluir uma
subtarefa (ver §2 "Consumo de peças"). `StockWithdrawalRequest`: `id`,
`workOrderId` (→ WorkOrder, sempre preenchido), `subtaskId`? (→ Subtask,
preenchido só quando a origem foi a conclusão de uma subtarefa), `status`
(PENDENTE | APROVADA | REJEITADA), `notApplicable` (bool — true quando o
usuário declarou que não usou peças; nesse caso a request já nasce
APROVADA), `requestedById` (→ User), `reviewedById`?/`reviewedAt`?/
`reviewNotes`? (preenchidos por quem tem `canManageStock` ao revisar),
`items` (→ StockWithdrawalRequestItem[]), `createdAt`, `updatedAt`.
`StockWithdrawalRequestItem`: `id`, `requestId`, `partId` (→ Part),
`quantity`. Aprovar dispara `recordStockMovement` (tipo SAIDA) + cria
`WorkOrderPart` para cada item; rejeitar só grava `reviewNotes`, sem tocar
em estoque.

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

### 5.2 — Exclusão lógica de OS/plano ("baú de cancelados e excluídos") — EM CONSTRUÇÃO, só Fase 1 pronta
Feature planejada em 9 fases para dar ao SUPERVISOR um caminho de descarte de
OS abertas por engano, sem nunca apagar linha nenhuma do banco nem perder
histórico/auditoria. **Estado real em 2026-09-17: Fases 1 e 2 prontas.**
Fase 1 — migração `20260917115159_add_work_order_exclusion` (colunas
`excludedAt`/`excludedById`/`exclusionReason` em `WorkOrder` e
`MaintenancePlan`, ver §5). Fase 2 — endpoint `POST /workorders/:id/excluir`
(`workorders/service.ts#excluir`, `SUPERVISOR`-only), com `excluirSchema`
(`reason` obrigatório). **Ainda não existe filtro de indicador, filtro de
listagem "viva" nem tela nenhuma usando esses campos** — a OS excluída
continua aparecendo em `ListaOS`/Dashboard/indicadores normalmente até a
Fase 3/4 serem feitas; não assumir que a feature já esconde nada da UI.

Decisões de design já fechadas (não reabrir sem confirmar com o usuário):
- **Exclusão só é válida para OS em `ABERTA`** (nunca saiu da fase inicial —
  nem chegou a `TRIAGEM`). Qualquer OS que já andou e precisa ser descartada
  no meio do caminho usa `cancelar()` (→ `CANCELADA`), nunca exclusão. As
  duas coisas são semânticas diferentes por decisão explícita: "cancelada" =
  trabalho real interrompido; "excluída" = erro de abertura.
- **Exclusão lógica, não física.** A OS/plano não é apagado — os 3 campos
  são preenchidos, a OS some das telas operacionais/pendências e de
  **todo** indicador (diferente de `CANCELADA`, que hoje conta normalmente
  em indicadores/Dashboard), mas continua íntegra no banco e visível só no
  "Baú" (tela nova, `SUPERVISOR`-only, ainda não construída).
- **`SUPERVISOR`-only e `reason`/`exclusionReason` obrigatório** para
  exclusão — mesma exigência que `cancelar()` **já** cumpre hoje
  (`cancelarSchema.note`, `min(1)`) sem precisar de nenhuma mudança; a
  exclusão nova deve seguir o mesmo padrão de validação.
- **Exclusão em cascata pro plano rascunho:** ao excluir **ou cancelar** uma
  OS PREVENTIVA cujo `maintenancePlanId` aponta pra um plano rascunho
  (`periodicity === null`) sem nenhuma outra OS **não-excluída** vinculada, o
  plano leva o mesmo trio de campos (`excludedAt`/`excludedById`/
  `exclusionReason`) na mesma transação. Se o plano tiver outra OS vinculada,
  não é tocado. Implementado uma única vez em
  `workorders/service.ts#cascadeExcludeDraftMaintenancePlan`, chamado tanto
  por `excluir()` quanto por `cancelar()` — os dois são os únicos caminhos
  pelos quais uma OS PREVENTIVA sai de circulação sem nunca ter sido
  encerrada, então os dois precisam da mesma cascata (senão o plano rascunho
  fica órfão, visível na Agenda pra sempre, sem nenhuma OS "viva" apontando
  pra ele).
- **Auditoria reaproveitando `StatusHistory`**, sem tabela nova: gravar um
  registro com `fromStatus === toStatus` e a nota, mesmo padrão que
  `reprogramacao()` já usa para ações que não mudam o `status` da OS.

**`POST /workorders/:id/excluir` (Fase 2, pronto):** `SUPERVISOR`-only. Body
`{ reason: string }` (`400` se vazio). `404 WORK_ORDER_NOT_FOUND` se a OS não
existir; `409 ALREADY_EXCLUDED` se já excluída; `422
WORK_ORDER_NOT_IN_INITIAL_PHASE` se `status !== ABERTA`. Sucesso: preenche os
3 campos, grava `StatusHistory` (`fromStatus === toStatus`, nota prefixada
`[EXCLUSÃO]`) e, se a OS for PREVENTIVA vinculada a um plano rascunho
(`periodicity === null`) sem **nenhuma outra OS não-excluída** apontando pra
ele, marca o mesmo trio de campos no plano também — mesma transação. Não usa
`applyTransition`/`canTransition` (não é transição de status), mesmo
espírito de `reprogramacao()`/`timelineOverride()`. Testado por
`src/test/workorder-exclusao.test.ts` (8 casos) — **suíte ainda não roda
localmente** porque `TEST_DATABASE_URL` não está configurado neste `.env`;
validado por um smoke test manual e descartável direto contra produção
(SUP.CMMS), com dados de teste prefixados e limpos ao final (resíduo
confirmado zero) — rodar a suíte de verdade na primeira vez que houver um
branch de teste disponível.

**Fase 3 (indicadores, pronta):** todo `where` de
`indicators/service.ts` (`fetchWorkOrdersForIndicators`, `getOverview`'s
`oldest`/`firstWorkOrderAt`, `getLifecycle`, `getDistribution` + seu
`previousCount` de tendência, `getTechnicianEfficiency`'s `currentLoad`) —
6 pontos — ganhou `excludedAt: null`. Uma OS excluída não conta em MTTR,
MTBF, aderência, backlog, ciclo de vida, distribuição, eficiência por
técnico, `totalWorkOrders`/`byType`/`firstWorkOrderAt` do Dashboard. Uma OS
`CANCELADA` continua contando normalmente em tudo isso — só `excludedAt`
filtra, nunca `status`.

**Fase 4 (listagens operacionais, pronta):** `listWorkOrders` e
`listMaintenancePlans` ganharam `excludedAt: null` por padrão no `where`,
condicionado a um novo parâmetro de query — `incluirExcluidas` em
`GET /workorders`, `incluirExcluidos` em `GET /maintenance-plans` (ambos
`boolean`, default `false`). Como nenhuma tela hoje envia esse parâmetro,
toda listagem existente (Fila de Triagem, `ListaOS`, `MinhasOS`, Agenda,
`AgendaProgramacao`, `PreventivasTecnico`) já filtra sozinha, sem precisar
tocar em nenhum código de frontend — só o futuro Baú (Fase 5) vai passar
`true`. `getWorkOrderById` (`GET /workorders/:id`, acesso direto por id)
**não** foi alterado de propósito — continua acessível mesmo excluída.

Testado por `src/test/workorder-exclusao-visibilidade.test.ts` (6 casos,
asserções por delta antes/depois — o banco de teste é compartilhado entre
arquivos, sem reset por arquivo). Mesma limitação de `TEST_DATABASE_URL`
ausente das Fases 1/2 — validado por smoke test manual contra produção,
dados prefixados, limpos ao final.

**Achado de infraestrutura (fora do escopo desta feature, não corrigido):**
durante a validação em produção, `POST /workorders` para `PREVENTIVA` e o
próprio `POST /workorders/:id/excluir` esbarraram repetidamente no timeout
de 5s de transação interativa do Prisma (`P2028`), com a mesma chamada às
vezes passando e às vezes não. Causa provável: a `DATABASE_URL` usa o
endpoint `-pooler` do Neon (pooling em modo transação, estilo PgBouncer),
que é uma combinação conhecida por instabilidade com `prisma.$transaction`
interativo — Prisma/Neon recomendam uma conexão direta (não pooled) para
esse caso. Isso é pré-existente (afeta `createWorkOrder`, `applyTransition`,
`timelineOverride`, `reprogramacao`, e agora também `excluir`) e não foi
introduzido por esta feature — não tocado aqui por estar fora do escopo
declarado das Fases 3/4; sinalizar se voltar a acontecer com frequência em
produção real (não só em teste de alta latência).

**Fase 5 (endpoint do Baú, pronta):** `GET /workorders/bau`
(`SUPERVISOR`-only, paginado) — `workorders/service.ts#listBau`, `where:
{ OR: [{ status: CANCELADA }, { excludedAt: { not: null } }] }`, ordenado
por `updatedAt desc`. Cadastrada **antes** de `GET /:id` em `routes.ts`
(senão o Express casaria `bau` como `:id`). Normaliza os dois mecanismos de
auditoria (campos diretos da exclusão vs. a `StatusHistory` mais recente
com `toStatus: CANCELADA`) num único `bauInfo: { kind: "EXCLUIDA" |
"CANCELADA", reason, by, at }` por item, pra Fase 7 (tela) não precisar
conhecer a diferença por baixo.

**Guard "OS excluída fica congelada" (adicionado junto, não parte do
desenho original):** a Fase 5 expôs uma lacuna — como `excluir()` nunca
muda `WorkOrder.status` (só preenche os 3 campos, permanece `ABERTA`), nada
impedia um SUPERVISOR de chamar `cancelar()`/`triagem()`/`timelineOverride`/
`reprogramacao()` numa OS já excluída depois, o que geraria um registro
contraditório no Baú (`CANCELADA` **e** `excludedAt` preenchido ao mesmo
tempo). Corrigido com um guard `if (workOrder.excludedAt) throw 409
ALREADY_EXCLUDED` logo após buscar a OS em `applyTransition` (cobre
`triagem`/`planejamento`/`programacao`/`iniciar`/`validar`/`cancelar`/
`registrar` de uma vez, todas passam por ali) **e** repetido em
`reprogramacao()`/`timelineOverride()`, que têm suas próprias transações
manuais e não passam por `applyTransition`. Uma OS excluída agora é
terminal de fato — nenhuma rota consegue mais alterá-la.

Testado por `src/test/workorder-bau.test.ts` (9 casos: os dois `kind` do
Baú, OS ativa ausente, 403 por role, e os 4 guards de "congelada").
Validado por smoke test manual contra produção (mesma limitação de
`TEST_DATABASE_URL` ausente) — 13/13, sem a instabilidade de pooler das
Fases 3/4 (só operações `CORRETIVA`, mais leves).

**Fase 6 (ação "Excluir OS" no frontend, pronta):** `DetalheOS.tsx` ganhou
a ação `excluir` — botão vermelho, ao lado de "Cancelar", só quando
`status === ABERTA` **e** `role === SUPERVISOR` (`getAvailableActions`).
`ExcluirForm.tsx` (mesmo padrão de `CancelarForm.tsx`, motivo obrigatório)
chama `POST /workorders/:id/excluir` via `api/workorders.ts#excluir`.
`getAvailableActions` também retorna `[]` de imediato se `wo.excludedAt`
estiver preenchido — nenhuma ação aparece pra uma OS já excluída (ela fica
congelada desde a Fase 5, então nem faria sentido oferecer botão nenhum).
Se alguém navegar direto pra uma OS excluída (ex.: link antigo, ou a partir
da Fase 7), a página mostra um aviso vermelho no topo com motivo/autor/data
em vez de simplesmente não ter nenhum botão sem explicação. `types.ts`
(`WorkOrder`) e `api/workorders.ts` ganharam os 4 campos de exclusão
correspondentes aos que o backend já retorna desde a Fase 1 (`excludedAt`,
`excludedById`, `excludedBy`, `exclusionReason` — sempre presentes na
resposta de `GET /workorders/:id`, já que `include` do Prisma não restringe
campos escalares do model, só adiciona relações).

Sem suíte de teste de frontend configurada no projeto — validado por
`tsc -b` (type-check) e `npm run build` (build de produção real), ambos
limpos; sem chamada a banco nesta fase (é só código de UI consumindo um
endpoint já testado na Fase 2).

**Fase 7 (tela do Baú, pronta):** `pages/Bau.tsx`, rota `/bau`
(`RequireRole [SUPERVISOR]` em `App.tsx`) + item no menu lateral
(`AppLayout.tsx`, `SUPERVISOR`-only). Consome `GET /workorders/bau` (Fase
5) via `api/workorders.ts#getBau`. Tabela simples (`Table`/`Badge`/
`EmptyState` já existentes): número, título, ativo, tipo, badge "Excluída"/
"Cancelada" (`bauInfo.kind`), motivo, autor, data — clicar na linha navega
pra `/ordens/:id` (que já mostra o aviso de exclusão, Fase 6). `BauInfo`/
`BauItem` novos em `types.ts`.

**Fase 8 (botão "Excluir" do plano corrigido, pronta):** `deleteMaintenancePlan`
continua existindo do jeito que estava (só apaga plano sem NENHUMA OS
vinculada — o que nunca é o caso de um rascunho). O que mudou é a reação
do frontend ao erro: `MaintenancePlanModal.tsx#handleDelete` agora detecta
`422 MAINTENANCE_PLAN_HAS_WORK_ORDERS` e mostra uma mensagem específica —
se o plano era rascunho (`periodicity` null na origem, guardado em
`wasDraft`), orienta a excluir a OS que o originou (Fase 2/6, cascateia
pro plano automaticamente); senão, orienta a desativar (`active=false`) em
vez de excluir. Antes disso o usuário só via a mensagem genérica do
backend, que sugeria "desativar" mesmo quando excluir a OS (caminho novo,
melhor pro caso de rascunho) já resolvia o problema de vez.

**Fase 9 (fechamento, pronta):** jornada completa das Fases 1-6 validada
de ponta a ponta contra produção num único smoke test (criar OS PREVENTIVA
→ plano rascunho vinculado → indicadores contam → listagem inclui → excluir
→ ler direto do banco (não cache) confirmando `excludedAt`/cascata no
plano/`status` inalterado → indicadores voltam ao baseline → listagens
excluem por padrão e reincluem com o parâmetro → Baú mostra com
`bauInfo` correto → OS excluída rejeita `cancelar()` com
`409 ALREADY_EXCLUDED`) — 16/16, resíduo zero.

**Ajuste pós-Fase 9 (2026-09-17):** a cascata pro plano rascunho, que até
então só disparava em `excluir()`, passou a disparar também em `cancelar()`
(extraída para `cascadeExcludeDraftMaintenancePlan`, ver decisão de design
acima) — sem isso, cancelar a única OS PREVENTIVA de um plano rascunho
deixava o plano órfão, sem nenhuma OS vinculada e sem forma de gerar uma nova
sem duplicar o plano. Cobertura nova em
`src/test/workorder-exclusao.test.ts` (2 casos, mesmo padrão dos 2 já
existentes para `excluir()`) — mesma limitação de `TEST_DATABASE_URL`
ausente, não rodada localmente ainda.

**Estado final da feature "exclusão lógica de OS / baú de cancelados e
excluídos": as 9 fases estão prontas e em produção** (backend + frontend).
Gap de infraestrutura que permanece, fora do escopo desta feature: (1)
`TEST_DATABASE_URL` não configurado neste `.env` local — toda a validação
das 9 fases foi feita por smoke test manual contra produção (dados
prefixados, limpos ao final, resíduo verificado a cada rodada), nunca pela
suíte automatizada real; (2) o endpoint `-pooler` do Neon em `DATABASE_URL`
combinado com `$transaction` interativo do Prisma, que gerou timeouts
intermitentes (`P2028`) especificamente em `createWorkOrder(PREVENTIVA)` e
em `excluir()` durante testes de alta latência — pré-existente ao
projeto inteiro, não introduzido por esta feature.

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
| ABERTA | TRIAGEM | TECNICO/SUPERVISOR | define priority + targetSectorId + trabalhoEmAltura; opcionalmente também define/atualiza a `periodicity` do `MaintenancePlan` vinculado, se a OS for PREVENTIVA (ver §2 "Indicador de periodicidade") |
| TRIAGEM | PLANEJADA | TECNICO/SUPERVISOR | preenche `plan`, tools/ppe, peças planejadas, substitui `assignees` de apoio |
| PLANEJADA | PROGRAMADA | SUPERVISOR | exige scheduledStart/End + ≥1 assigneeId (1º = principal); tempo estimado obrigatório só se PREVENTIVA; acrescenta `assignees` de apoio (não substitui) |
| TRIAGEM | EM_EXECUCAO | TECNICO | atalho: pula a programação do supervisor (qualquer prioridade) |
| PLANEJADA | EM_EXECUCAO | TECNICO | mesmo atalho, quando já houve planejamento |
| PROGRAMADA | EM_EXECUCAO | TECNICO (assignedTo ou apoio) | cria Execution, `startedAt = now()`, registra `startedById`/`startNote` |
| EM_EXECUCAO | AGUARDANDO_VALIDACAO | TECNICO (assignedTo ou apoio) | `finishedAt = now()`; **exige declarar consumo de peças** (`parts` ou `partsNotApplicable` — `400` se nenhum vier, ver §2) e cria a `StockWithdrawalRequest`; **bloqueado** por `422 HAS_OPEN_SUBTASKS` se houver subtask ABERTA |
| AGUARDANDO_VALIDACAO | ENCERRADA | SUPERVISOR | valida e dá baixa; **mesmo bloqueio** de subtask aberta; se PREVENTIVA com plano `active` + `periodicity` definida, dispara pós-commit a geração automática do próximo ciclo (ver §2 "Indicador de periodicidade") |
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
  **Réplica visual do compromisso recorrente:** para um plano com
  periodicidade definida, o calendário não mostra só o próximo vencimento —
  `eventsByDay` (em `MaintenanceCalendar.tsx`) projeta uma ocorrência a cada
  intervalo da periodicidade (`PERIODICITY_DAYS`, ajustada a dia útil por
  `frontend/src/lib/businessDays.ts` — cópia intencional da lógica de
  `backend/src/lib/businessDays.ts`, já que são builds TS separados) dentro
  do período atualmente visível (mês/semana/dia — cresce/encolhe conforme o
  usuário navega, nunca é uma lista ilimitada). Só a 1ª ocorrência (a real,
  vinda de `dueDate`/`openWorkOrder` calculados no backend) é acionável
  ("Gerar OS"); as seguintes são só projeção (`plan.isProjected`, campo
  client-side que nunca vem do backend) — aproximação que assume que cada
  ciclo futuro fecha exatamente no vencimento, já que o vencimento real de
  cada ciclo só é recalculado quando o ciclo anterior de fato encerra (ver
  `autoGenerateNextPreventiveCycle` no §2).
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

- **`/overview`** também retorna, além de MTTR/MTBF/aderência/backlog:
  `totalWorkOrders`/`closedWorkOrders`/`cancelledWorkOrders` (contagens sobre
  o mesmo conjunto filtrado por `from`/`to`/`targetSectorId`), `byType`
  (contagem por `WorkOrderType`) e `firstWorkOrderAt`/`daysSinceFirst` —
  estes dois últimos **ignoram `from`/`to` de propósito** (sempre a 1ª OS já
  criada no sistema, não o início do período filtrado), já que alimentam o
  bloco "Overview do sistema" do Dashboard (`frontend/src/pages/Dashboard.tsx`),
  que chama `getOverview` sem filtros. Esse bloco (visível só a
  TECNICO/SUPERVISOR, mesmo gate do endpoint) mostra o total de OS desde o
  início como "folhas de papel economizadas" (1 OS = 1 folha, decisão de
  produto — cada OS aberta no sistema substitui uma folha que antes seria
  impressa/preenchida à mão), convertidas em resmas quando ≥ 500, além de
  card grid (OS encerradas, backlog, média de OS/dia) e distribuição por
  tipo.

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
