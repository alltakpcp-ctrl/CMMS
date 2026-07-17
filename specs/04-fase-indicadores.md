# 04 — FASE INDICADORES (Etapa 6)

**Objetivo:** implementar o cálculo dos indicadores de manutenção (MTBF, MTTR,
aderência à programação, backlog) na API e exibi-los em um dashboard visual.

**Pré-requisitos:** fases 1–3 concluídas. Reler §8 do CLAUDE.md. É essencial que a
auditoria de StatusHistory e os timestamps de Execution estejam corretos.

---

## Tarefas

### 4.1 — Serviço de cálculo (backend)
Criar `src/lib/indicators.ts` com funções puras e testáveis:

- **MTTR por ativo:** média de `(finishedAt − startedAt)` das OS ENCERRADAS do
  ativo, em horas. Retornar também o valor agregado (todos os ativos).
- **MTBF por ativo:** conforme fórmula do §8 (documentar a fórmula exata escolhida
  em comentário no código). Considerar OS corretivas encerradas.
- **Aderência à programação:** (OS iniciadas dentro da janela `scheduledStart`) ÷
  (OS que foram programadas) × 100. Definir tolerância (ex.: iniciou no dia
  agendado) e documentá-la.
- **Backlog / programadas a executar:** contagem de OS em PROGRAMADA e status
  anteriores, agrupável por setor e prioridade.

Cada função deve lidar com divisões por zero (retornar null/0 com flag "sem dados").

### 4.2 — Endpoints
- `GET /indicators/overview` — cartões-resumo: MTTR global, MTBF global, aderência
  global, total de backlog. (SUPERVISOR completo; TECNICO/OPERADOR leitura.)
- `GET /indicators/by-asset` — tabela por ativo com MTBF e MTTR.
- `GET /indicators/backlog` — backlog agrupado por setor e prioridade.
- `GET /indicators/trend?metric=mttr&period=month` — série temporal (opcional/nice).
- Todos aceitam filtros de período (`from`, `to`) e setor.

### 4.3 — Dashboard de indicadores (frontend)
- Nova tela "Indicadores".
- Cartões (KPIs) com MTTR, MTBF, aderência e backlog total.
- Tabela por ativo (MTBF/MTTR), ordenável, destacando ativos mais críticos.
- Gráfico de barras: backlog por setor/prioridade (usar biblioteca de gráficos,
  ex.: recharts).
- Filtros de período e setor no topo, refazendo as consultas.
- Estado vazio claro quando não há dados suficientes.

### 4.4 — Consistência
- Conferir que os números batem com um caso de teste conhecido (usar dados do
  seed/demo da fase 5 ou criar OS de teste com tempos controlados).

---

## Critérios de aceite (Definition of Done)

- [ ] Endpoints de indicadores retornam JSON agregado correto e filtrável.
- [ ] Divisões por zero tratadas (sem NaN/Infinity).
- [ ] Dashboard exibe KPIs, tabela por ativo e gráfico de backlog.
- [ ] Filtros de período e setor funcionam.
- [ ] Perfis de leitura veem o dashboard; ações restritas continuam bloqueadas.
- [ ] Testes unitários das funções de indicadores passam com dados controlados.

**Ao concluir:** resumo + como validar os números (exemplo de cálculo manual vs.
sistema) e **parar**. Não iniciar a fase 5.
