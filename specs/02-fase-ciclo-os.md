# 02 — FASE CICLO DA OS (API — etapas 1 a 5)

**Objetivo:** implementar toda a API do ciclo de vida da Ordem de Serviço, com a
máquina de estados, numeração automática, baixa de peças e auditoria de status.
Cobre as etapas 1 a 5 do processo.

**Pré-requisitos:** fase 1 concluída. Reler §5, §6, §7 e §10 do CLAUDE.md.

---

## Tarefas

### 2.1 — Máquina de estados (função pura)
- Criar `src/lib/workOrderStateMachine.ts`.
- Implementar exatamente a tabela de transições do §6 do CLAUDE.md.
- Função `canTransition({ from, to, role, context })` → `{ ok: boolean, reason?: string }`.
- Validar também pré-condições de contexto (ex.: ir para PROGRAMADA exige
  scheduledStart e assignedTo; PROGRAMADA→EM_EXECUCAO exige que o técnico seja o
  `assignedTo`; transições que exigem nota devem recebê-la).
- Cobrir com testes unitários simples (casos válidos e inválidos).

### 2.2 — Numeração de OS
- Criar `src/lib/workOrderNumber.ts` implementando o formato `OS-YYYY-NNNNNN` (§7).
- Geração dentro de transação para evitar colisão em concorrência.

### 2.3 — Cadastros de apoio (usados pela OS)
Módulos com CRUD protegido por RBAC (cadastros = só SUPERVISOR; leitura liberada a
todos os autenticados):
- **assets**: `GET /assets`, `GET /assets/:id`, `POST/PUT/DELETE` (SUPERVISOR).
- **parts**: `GET /parts`, `GET /parts/:id`, `POST/PUT/DELETE` (SUPERVISOR).
- **users**: `GET /users` (SUPERVISOR), `POST /users` (SUPERVISOR).
  Nunca retornar passwordHash.

### 2.4 — Módulo workorders: criação (Etapa 1 — Abertura)
- `POST /workorders` (qualquer perfil autenticado):
  body: type, title, description, assetId, (opcional) targetSector.
  - Gera `number`, seta status ABERTA, `requesterId = req.user`.
  - Cria registro em StatusHistory (from null → ABERTA).
- `GET /workorders` com filtros: status, type, targetSector, assetId, assignedToId,
  requesterId. Paginação simples.
- `GET /workorders/:id` retornando OS + asset + requester + execution + peças +
  histórico.

### 2.5 — Transição genérica de status
- `PATCH /workorders/:id/status`:
  body: `toStatus`, campos específicos da transição, `note` (quando exigido).
  - Carrega a OS, chama `canTransition`, aplica efeitos colaterais, persiste,
    registra StatusHistory. Tudo em transação.
- Alternativa aceitável: endpoints dedicados por etapa (abaixo). Escolher UMA
  abordagem e ser consistente. Recomenda-se endpoints dedicados por clareza:

### 2.6 — Etapa 2: Triagem e Planejamento
- `POST /workorders/:id/triagem` (TECNICO/SUPERVISOR):
  define priority e targetSector → status TRIAGEM.
- `POST /workorders/:id/planejamento` (TECNICO/SUPERVISOR):
  preenche `plan` → status PLANEJADA.

### 2.7 — Etapa 3: Programação
- `POST /workorders/:id/programacao` (SUPERVISOR):
  define scheduledStart, scheduledEnd, assignedToId (deve ser um TECNICO) →
  status PROGRAMADA.

### 2.8 — Etapa 4: Execução
- `POST /workorders/:id/iniciar` (TECNICO = assignedTo):
  cria Execution, seta `startedAt = now()`, grava `riskAnalysis` → status EM_EXECUCAO.
- `POST /workorders/:id/registrar` (TECNICO = assignedTo):
  atualiza Execution (rootCause, repairDescription) e registra peças usadas:
  - para cada peça: criar WorkOrderPart e **dar baixa** em `Part.stockQty`
    (validar saldo; erro se insuficiente). Tudo em transação.

### 2.9 — Etapa 5: Encerramento técnico e Validação
- `POST /workorders/:id/encerramento-tecnico` (TECNICO = assignedTo):
  grava testNotes, cleanupDone, seta `finishedAt = now()` → status
  AGUARDANDO_VALIDACAO.
- `POST /workorders/:id/validar` (SUPERVISOR):
  - aprovar → status ENCERRADA (baixa).
  - reprovar → status EM_EXECUCAO, `note` obrigatória.
- `POST /workorders/:id/cancelar` (SUPERVISOR): status CANCELADA, `note` obrigatória.

### 2.10 — Auditoria
- Garantir que **toda** transição grava StatusHistory (from, to, changedBy, note,
  changedAt). Sem exceção — isso alimenta os indicadores da fase 4.

---

## Critérios de aceite (Definition of Done)

- [ ] É possível percorrer todo o fluxo via API (curl/Insomnia):
      abrir → triagem → planejar → programar → iniciar → registrar → encerramento
      técnico → validar → ENCERRADA.
- [ ] Transições inválidas são rejeitadas (403 por role errado; 409/422 por estado
      inválido) com mensagem clara.
- [ ] Numeração `OS-YYYY-NNNNNN` sequencial e única.
- [ ] Baixa de peças reduz `stockQty` e bloqueia saldo insuficiente.
- [ ] `startedAt` e `finishedAt` são preenchidos automaticamente.
- [ ] StatusHistory registra todas as transições.
- [ ] Testes unitários da máquina de estados passam.

**Ao concluir:** resumo + coleção/exemplos de chamadas para testar o fluxo completo,
e **parar**. Não iniciar a fase 3.
