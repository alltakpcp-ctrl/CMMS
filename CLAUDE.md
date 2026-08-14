# CLAUDE.md — Sistema CMMS de Gestão de Ordens de Serviço

> Este arquivo é o contexto permanente do projeto. Leia-o por inteiro antes de
> executar QUALQUER spec em `/specs`. Ele descreve stack, regras de negócio,
> modelo de dados, permissões e convenções. As specs de fase se apoiam nele.

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
6. **Análise de Indicadores** (MTBF, MTTR, aderência à programação)

Tipos de manutenção suportados: **Corretiva**, **Preventiva**, **Preditiva**.
Setores de destino: **Mecânica**, **Elétrica**, **Predial**.

---

## 2. Stack técnica (obrigatória)

| Camada | Tecnologia |
|---|---|
| Backend | Node.js (LTS) + Express |
| ORM | Prisma |
| Banco (dev local) | **SQLite** (arquivo local `dev.db`) |
| Banco (produção) | **PostgreSQL (Neon)** — já em produção; ver "Decisão de produção" abaixo <!-- TODO confirmar: dev local ainda usa SQLite ou já migrou para Postgres? --> |
| Frontend | React + Vite + Tailwind CSS |
| Auth | JWT (access token) + hash de senha com bcrypt |
| Validação | zod (backend) |
| HTTP client (front) | fetch nativo ou axios |
| Datas | `Date` nativo <!-- TODO confirmar: dayjs removido do SubtaskPanel; verificar se ainda há uso em outras telas antes de remover a dependência de vez --> |

### Decisões de MVP já tomadas (NÃO reabrir)
- **Banco = SQLite.** Migração para Postgres deve ser trivial: usar apenas tipos
  compatíveis com ambos e concentrar a config no `datasource` do Prisma.
- **Enums = String + validação em TypeScript.** SQLite não suporta enums nativos no
  Prisma. Portanto os campos `role`, `sector`, `type`, `status`, `priority` são
  `String` no schema, com os valores válidos definidos em
  `backend/src/domain/enums.ts` e validados via zod. Onde este documento diz "enum",
  leia "String restrita aos valores de `domain/enums.ts`". A migração futura para
  Postgres pode converter esses campos em enums nativos, se desejado.
- **Almoxarifado = controle de estoque com kardex.** Peças têm saldo (`stockQty`,
  fonte de verdade cacheada) e campos de controle (`minStock`, `unitCost`,
  `location`, `sectorId` opcional, `active`). Toda alteração de saldo grava um
  `StockMovement` (kardex auditável) na MESMA transação, via helper
  `recordStockMovement(tx, input)` — nunca increment/decrement, sempre valor
  absoluto; saldo negativo é bloqueado (422 `INSUFFICIENT_STOCK`). A baixa por
  execução de OS é automática (tipo `SAIDA`). Movimentação manual (entrada, ajuste,
  devolução) é permitida a SUPERVISOR ou a TÉCNICO com a flag `canManageStock`, com
  observação (`reason`) obrigatória. **NÃO** há fluxo de aprovação de retirada nem
  perfil de almoxarife dedicado.
- **Preventiva = abertura manual** no MVP. Deixar um campo/gancho no modelo
  (`Asset.preventivePeriodicityDays`, opcional) preparado para futura automação,
  mas **NÃO** implementar agendador/cron agora.

### Decisão de produção (deploy)
- **Banco em produção = PostgreSQL no Neon.** SQLite fica APENAS para
  desenvolvimento local. Motivo: os dados são críticos (histórico operacional de
  manutenção, base dos indicadores) e exigem backup automático e point-in-time
  recovery, que SQLite em disco persistente não oferece com segurança.
- **Hospedagem:** backend no Render (Web Service Node), frontend no Vercel (build
  estático do Vite), banco no Neon. Deploy automático via Git push.
- O código deve suportar AMBOS os bancos sem alteração de lógica: `provider` e
  `DATABASE_URL` do Prisma controlados por variável de ambiente. Local usa SQLite;
  produção usa Postgres. Ver `specs/06-fase-deploy.md`.

---

## 3. Estrutura de pastas do projeto

```
/
├── CLAUDE.md
├── /specs                 # instruções por fase (não versionar como código)
├── /backend
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── config/        # env, prisma client
│   │   ├── middlewares/   # auth, rbac, error handler
│   │   ├── modules/       # um diretório por domínio (auth, users, assets, parts, stock, workorders, subtasks, indicators)
│   │   │   └── <mod>/     # routes.ts, controller.ts, service.ts, schema.ts
│   │   ├── lib/           # helpers (workorder state machine, indicators calc)
│   │   ├── app.ts
│   │   └── server.ts
│   ├── .env.example
│   └── package.json
└── /frontend
    ├── src/
    │   ├── api/           # wrappers de chamadas ao backend
    │   ├── auth/          # contexto de auth, guard de rotas
    │   ├── components/    # UI reutilizável
    │   ├── pages/         # uma pasta por tela
    │   ├── hooks/
    │   ├── lib/
    │   ├── App.tsx
    │   └── main.tsx
    ├── index.html
    └── package.json
```

---

## 4. Perfis de usuário (RBAC)

Três perfis. Enum: `OPERADOR`, `TECNICO`, `SUPERVISOR`.

| Ação / Etapa | OPERADOR | TECNICO | SUPERVISOR |
|---|:--:|:--:|:--:|
| (1) Abrir solicitação | ✅ | ❌ | ✅ |
| (2) Triagem / priorização | ❌ | ✅ | ✅ |
| (2) Planejamento (peças, ferramentas, procedimentos) | ❌ | ✅ | ✅ |
| (3) Programação / agendamento | ❌ | ❌ | ✅ |
| (4) Executar e registrar reparo | ❌ | ✅ | ❌ |
| (5) Encerramento técnico | ❌ | ✅ | ❌ |
| (5) Validar e dar baixa na OS | ❌ | ❌ | ✅ |
| (6) Ver indicadores | 👁️ leitura | 👁️ leitura | ✅ completo |
| Cadastros (ativos, usuários) | ❌ | ❌ | ✅ |
| Cadastro de peças (criar/editar/excluir) | ❌ | 🔓 | ✅ |

- 👁️ = pode visualizar dashboard, mas sem exportar/gerir.
- 🔓 = também permitido a TECNICO com a flag `canManageStock` (mesmo gate de
  `POST /stock/entry|adjust|return`, via `supervisorOrCanManageStock()`).
- O middleware de RBAC deve bloquear no backend **independentemente** do que o
  frontend exibe. Frontend apenas oculta o que o usuário não pode fazer.
- TECNICO **não abre** solicitação — apenas responde a partir da triagem (etapa 2).
- Em qualquer prioridade, a OS pode ir direto de `TRIAGEM` ou `PLANEJADA` para
  `EM_EXECUCAO` pelo próprio técnico (auto-atribuído, quando ainda não há
  assignedTo), sem passar pela programação do SUPERVISOR (ver §6 e
  `workOrderStateMachine.ts`).

---

## 5. Modelo de dados

Entidades e campos essenciais. Ajustar nomes de colunas para camelCase no Prisma.

### User
- `id`, `name`, `email` (único), `passwordHash`, `role` (enum acima),
  `active` (bool), `createdAt`.

### Asset (Ativo)
- `id`, `code` (único), `name`, `sector` (enum: MECANICA, ELETRICA, PREDIAL),
  `location`, `criticality` (int 1–5, onde 5 = mais crítico),
  `preventivePeriodicityDays` (int, opcional — gancho futuro),
  `active` (bool), `createdAt`.

### Part (Peça / item de almoxarifado)
- `id`, `code` (único), `description`, `unit` (ex.: "un", "m", "L"),
  `stockQty` (int, saldo cacheado), `minStock` (int?), `unitCost` (Decimal?),
  `location` (string?), `sectorId` (→ Sector, opcional), `active` (bool, default
  true), `createdAt`, `updatedAt`.

### WorkOrder (OS)
- `id`, `number` (string única, auto-gerada — ver §7),
- `type` (enum: CORRETIVA, PREVENTIVA, PREDITIVA),
- `status` (enum — ver §6),
- `priority` (enum: BAIXA, MEDIA, ALTA, URGENTE — derivada da criticidade +
  julgamento na triagem),
- `title`, `description` (relato inicial do solicitante),
- `requesterId` (→ User), `assetId` (→ Asset),
- `targetSector` (enum de setor — para qual equipe vai),
- `plan` (texto: ferramentas, procedimentos de segurança, escopo planejado — etapa 2),
- `scheduledStart` (datetime, opcional — etapa 3),
- `scheduledEnd` (datetime, opcional — etapa 3),
- `assignedToId` (→ User TECNICO, opcional — etapa 3),
- `createdAt`, `updatedAt`.

### Execution (registro de execução — 1:N com WorkOrder)
- `id`, `workOrderId` (→ WorkOrder, **sem** unique — uma OS pode ter mais de um
  ciclo de execução, ex.: reprovação na validação que volta pra `EM_EXECUCAO`),
- `riskAnalysis` (texto — análise de risco, etapa 4),
- `rootCause` (texto — causa raiz constatada, registro legado; ver `ExecutionLog`),
- `repairDescription` (texto — o que foi feito, registro legado; ver `ExecutionLog`),
- `startedAt` (datetime — preenchido automaticamente ao iniciar execução),
- `finishedAt` (datetime — preenchido automaticamente no encerramento técnico),
- `testNotes` (texto — testes com a operação, etapa 5),
- `cleanupDone` (bool — 5S, etapa 5).
- `logs` (→ `ExecutionLog[]`) — histórico de registros de causa raiz + reparo
  dentro do mesmo ciclo de `Execution`; cada chamada a `registrar()` cria uma
  entrada nova em vez de sobrescrever `rootCause`/`repairDescription`.

### Subtask (subtarefa dentro da OS — ortogonal a Execution)
- `id`, `workOrderId` (→ WorkOrder, `onDelete: Cascade`),
  `title`, `description` (opcional), `estimatedMinutes` (int, obrigatório na
  abertura, min. 1 — estimativa que o técnico digita ao abrir),
  `createdById` (→ User), `assignedToId` (→ User, obrigatório — dono atual da
  subtask), `finishedAt` (datetime, opcional), `createdAt`, `updatedAt`.
- `status` (string validada via zod, nunca enum nativo — mesma decisão do §2):
  `ABERTA` (default) → `CONCLUIDA` | `CANCELADA`. Transição só é permitida a
  partir de `ABERTA`.
- Técnicos registram partes concluídas do trabalho dentro de uma OS sem
  depender do ciclo de `Execution`. **Hard-block:** a OS não pode ir para
  `ENCERRADA` (transição `validar()` → `applyTransition`) enquanto houver
  subtask `ABERTA` — verificado em `workorders/service.ts#applyTransition`,
  logo antes do `mutate` da transição, erro `422 HAS_OPEN_SUBTASKS`. Esse
  código **não** entra no union `TransitionErrorCode` de
  `lib/workOrderStateMachine.ts` — é lançado direto via `AppError`, no mesmo
  padrão de `INSUFFICIENT_STOCK` (stock/service.ts).
- **Ownership guard** (módulo `subtasks`, checado no service — não em
  middleware, pois depende do `assignedToId` da subtask, não do papel do
  usuário): TECNICO só fecha/cancela/reatribui (`PATCH`) a subtask onde é
  `assignedToId`; SUPERVISOR pode em qualquer uma. Violação → `403
  SUBTASK_FORBIDDEN`. Abrir subtask é livre para TECNICO/SUPERVISOR.
- Ao abrir, `assignedToId` default é `createdById`, mas o criador pode já
  atribuir a outro técnico. Cancelar segue a mesma regra de fechar (dono ou
  SUPERVISOR).
- **Endpoints** (módulo `subtasks`, ver `app.ts`):
  `GET/POST /workorders/:workOrderId/subtasks` (nested, listar/abrir),
  `PATCH /subtasks/:id` (editar/reatribuir), `POST /subtasks/:id/finish`,
  `POST /subtasks/:id/cancel`. Todas exigem `authorize(TECNICO, SUPERVISOR)`.
- **Exibição de duração (front, `SubtaskPanel.tsx`):** o card mostra a duração
  calculada a partir de `createdAt` — `Duração: <t>` para `CONCLUIDA` (usa
  `finishedAt`; se null, omite) e `Em andamento: <t>` para `ABERTA` (usa `now()`).
  Formatação via `lib/format.ts#formatDuration` (min/h). Auto-refresh a cada 60s
  por `setInterval`, ativado apenas quando há subtask `ABERTA`, com cleanup no
  unmount. Datas com `Date` nativo — **sem dayjs**.

### WorkOrderPart (peças usadas na OS)
- `id`, `workOrderId` (→ WorkOrder), `partId` (→ Part), `quantity` (int).
- Ao registrar, a baixa em `Part.stockQty` é feita via `recordStockMovement` (tipo
  `SAIDA`), que valida saldo e grava um `StockMovement` na mesma transação.

### StockMovement (kardex / livro-razão de estoque)
- `id`, `partId` (→ Part), `type` (string: `ENTRADA` | `SAIDA` | `AJUSTE` |
  `DEVOLUCAO`; Zod, não enum Prisma), `quantity` (int, sempre positivo),
  `balanceAfter` (int, saldo após o movimento), `unitCost` (Decimal?),
  `workOrderId` (→ WorkOrder, opcional), `partRequestId` (→ PartRequest,
  opcional), `userId` (→ User, quem executou), `reason` (string?), `createdAt`.
  Índice em `(partId, createdAt)`.

**Endpoints (módulo `stock`, prefixo `/stock`):**
- `POST /stock/entry` — entrada de estoque (tipo ENTRADA). Gate: SUPERVISOR ou
  TÉCNICO com `canManageStock`. `reason` obrigatório.
- `POST /stock/adjust` — ajuste de saldo (`direction: increase|decrease`;
  increase→ENTRADA, decrease→AJUSTE). Mesmo gate. `reason` obrigatório.
- `POST /stock/return` — devolução (tipo DEVOLUCAO, credita; `workOrderId` opcional
  de referência, sem validação cruzada contra a baixa). Mesmo gate. `reason` obrigatório.
- `GET /stock/ledger/:partId` — extrato do kardex de uma peça. Gate: SUPERVISOR + TÉCNICO.

### StatusHistory (auditoria de transições)
- `id`, `workOrderId` (→ WorkOrder), `fromStatus`, `toStatus`,
  `changedById` (→ User), `note` (texto opcional), `changedAt` (datetime).
- **Toda** transição de status DEVE gerar um registro aqui. É a base dos indicadores.

---

## 6. Máquina de estados da OS

Enum `WorkOrderStatus`:

```
ABERTA → TRIAGEM → PLANEJADA → PROGRAMADA → EM_EXECUCAO → AGUARDANDO_VALIDACAO → ENCERRADA
```

Transição adicional: qualquer status (exceto ENCERRADA) pode ir para `CANCELADA`
(somente SUPERVISOR, com nota obrigatória).

### Regras de transição

| De | Para | Quem | Efeito colateral |
|---|---|---|---|
| — | ABERTA | qualquer perfil | cria OS, gera `number` |
| ABERTA | TRIAGEM | TECNICO/SUPERVISOR | define priority + targetSector |
| TRIAGEM | PLANEJADA | TECNICO/SUPERVISOR | preenche `plan` |
| PLANEJADA | PROGRAMADA | SUPERVISOR | define scheduledStart/End + assignedTo |
| PROGRAMADA | EM_EXECUCAO | TECNICO (assignedTo) | cria Execution, seta `startedAt = now()` |
| EM_EXECUCAO | AGUARDANDO_VALIDACAO | TECNICO (assignedTo) | preenche rootCause/repair/peças; seta `finishedAt = now()` |
| AGUARDANDO_VALIDACAO | ENCERRADA | SUPERVISOR | valida e dá baixa |
| AGUARDANDO_VALIDACAO | EM_EXECUCAO | SUPERVISOR | reprova validação, retorna p/ ajustes (nota obrigatória) |
| qualquer (≠ENCERRADA) | CANCELADA | SUPERVISOR | nota obrigatória |

- Transições fora dessa tabela devem ser **rejeitadas** com erro 409/422.
- Implementar a máquina de estados como função pura em `lib/workOrderStateMachine`
  que recebe (statusAtual, statusDestino, role, contexto) e retorna válido/inválido +
  motivo. O service usa essa função antes de persistir.

---

## 7. Regra de numeração da OS

Formato: `OS-YYYY-NNNNNN` (ano corrente + sequência zero-padded de 6 dígitos).
Ex.: `OS-2026-000001`. A sequência reinicia a cada ano.
Gerar de forma segura contra concorrência (transação + contador, ou consulta do
maior número do ano + 1 dentro de transação).

---

## 8. Indicadores (etapa 6)

Calculados a partir de `StatusHistory` e `Execution`. Sempre por ativo e agregável.

- **MTTR (Tempo Médio de Reparo)** — por ativo:
  média de `(Execution.finishedAt − Execution.startedAt)` das OS **encerradas**
  do ativo. Expressar em horas.

- **MTBF (Tempo Médio Entre Falhas)** — por ativo, considerando OS **corretivas**:
  soma do tempo de operação entre falhas ÷ número de falhas.
  Aproximação viável no MVP: para cada ativo, ordenar as OS corretivas encerradas
  por data; MTBF = (tempo total observado − tempo total em reparo) ÷ nº de falhas.
  Documentar a fórmula exata escolhida no código.

- **Aderência à programação** =
  (nº de OS cuja execução iniciou dentro da janela `scheduledStart`) ÷
  (nº de OS que foram programadas) × 100.

- **Backlog / programadas a executar** = contagem de OS em status
  PROGRAMADA e anteriores, agrupável por setor e prioridade.

Endpoints de indicadores retornam JSON agregado; o dashboard consome e plota.

---

## 9. Convenções de código

- TypeScript em backend e frontend.
- Nomes de variáveis/comentários podem ser em português; nomes de tabelas/campos
  Prisma em camelCase inglês (consistência com o ORM).
- Erros da API em formato: `{ "error": { "code": string, "message": string } }`.
- Status HTTP: 400 validação, 401 sem auth, 403 sem permissão, 404 não encontrado,
  409/422 transição inválida.
- Nunca retornar `passwordHash` em respostas.
- Variáveis sensíveis em `.env` (JWT_SECRET, DATABASE_URL). Fornecer `.env.example`.
- Commits pequenos e descritivos ao fim de cada tarefa relevante.

---

## 10. Regras de execução das specs (IMPORTANTE)

1. Executar as specs **na ordem numérica** (01 → 06).
2. Ao **terminar cada fase**, PARAR e apresentar um resumo do que foi feito +
   como testar. **Não** iniciar a próxima fase sem confirmação do usuário.
3. Respeitar rigorosamente as decisões de MVP do §2 (não implementar cron de
   preventiva, não criar fluxo de aprovação de retirada nem perfil de almoxarife
   dedicado — a permissão de movimentar estoque é a flag `canManageStock`, não um
   perfil novo).
4. Se algo na spec conflitar com este CLAUDE.md, **este arquivo prevalece** —
   sinalizar o conflito ao usuário antes de prosseguir.
5. Sempre que criar/alterar o schema, rodar migração e atualizar o seed.
6. Ao concluir a fase, garantir que `npm run dev` (back e front) sobe sem erros.