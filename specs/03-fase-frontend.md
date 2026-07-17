# 03 — FASE FRONTEND

**Objetivo:** construir todas as telas React conectadas à API da fase 2, com
navegação e visibilidade condicionadas ao perfil do usuário (RBAC no front apenas
esconde/mostra; o backend continua sendo a autoridade).

**Pré-requisitos:** fases 1 e 2 concluídas. Reler §4 (RBAC) e o mapeamento
processo→sistema em `00-OVERVIEW.md`.

---

## Tarefas

### 3.1 — Fundação de UI
- Layout principal com barra lateral/navegação, cabeçalho com nome + perfil +
  logout.
- Menu montado dinamicamente conforme o perfil (ver §4 do CLAUDE.md).
- Componentes reutilizáveis: Button, Input, Select, Textarea, Modal, Table, Badge
  (para status/prioridade), Card, EmptyState, Toast/feedback de erro.
- Camada `src/api/` com um wrapper por recurso (auth, assets, parts, users,
  workorders) usando o client autenticado.

### 3.2 — Tela: Nova Solicitação (Etapa 1)
- Formulário: tipo (corretiva/preventiva/preditiva), título, descrição, ativo
  (select carregado de `/assets`), setor destino (opcional).
- Disponível a todos os perfis.
- Ao enviar, mostra o número gerado da OS.

### 3.3 — Tela: Lista de OS
- Tabela com número, ativo, tipo, status (badge), prioridade (badge), setor,
  responsável, data.
- Filtros: status, tipo, setor, "minhas OS" (requester ou assignedTo).
- Clique abre o detalhe da OS.

### 3.4 — Tela: Detalhe da OS (hub do fluxo)
- Mostra todos os dados da OS, execução, peças e a **linha do tempo** de
  StatusHistory.
- Exibe as **ações disponíveis conforme status atual + perfil**, cada uma abrindo
  o formulário/modal correspondente:
  - **Triagem** (TECNICO/SUPERVISOR): prioridade + setor destino.
  - **Planejamento** (TECNICO/SUPERVISOR): campo `plan` (ferramentas, procedimentos
    de segurança, escopo).
  - **Programação** (SUPERVISOR): datas + seleção do técnico responsável.
  - **Iniciar execução** (TECNICO responsável): análise de risco.
  - **Registrar** (TECNICO responsável): causa raiz, descrição do reparo, seleção de
    peças + quantidade (com validação visual de saldo).
  - **Encerramento técnico** (TECNICO responsável): testes + checkbox 5S/limpeza.
  - **Validar** (SUPERVISOR): aprovar (encerra) ou reprovar (com nota).
  - **Cancelar** (SUPERVISOR): com nota.
- Botões/ações que o perfil não pode executar simplesmente não aparecem.
- Tratar erros da API exibindo a mensagem retornada.

### 3.5 — Tela: Fila de Triagem/Planejamento
- Atalho para OS em status ABERTA/TRIAGEM/PLANEJADA (TECNICO/SUPERVISOR),
  ordenadas por prioridade/criticidade do ativo.

### 3.6 — Tela: Agenda / Programação (Etapa 3)
- Visão para SUPERVISOR das OS PLANEJADAS a programar e das PROGRAMADAS.
- Pode ser lista por data (calendário completo é opcional/nice-to-have).

### 3.7 — Tela: Minhas OS (Técnico)
- Para TECNICO: OS atribuídas a ele, agrupadas por status, com acesso rápido às
  ações de execução/encerramento.

### 3.8 — Telas: Cadastros (SUPERVISOR)
- CRUD de Ativos, Peças e Usuários, com formulários e tabelas.
- Só visível/rota acessível para SUPERVISOR.

### 3.9 — Dashboard inicial
- Substituir o placeholder da fase 1 por um dashboard com contadores por status
  e atalhos, adaptado ao perfil. (Os gráficos de indicadores vêm na fase 4.)

---

## Critérios de aceite (Definition of Done)

- [ ] Login → dashboard adaptado ao perfil.
- [ ] Operador consegue abrir uma solicitação e vê-la na lista.
- [ ] Técnico e Supervisor conseguem percorrer o fluxo inteiro pela UI, cada ação
      no perfil correto, até ENCERRADA.
- [ ] Ações indevidas não aparecem para o perfil sem permissão.
- [ ] A linha do tempo de status é exibida no detalhe da OS.
- [ ] Erros da API aparecem de forma legível ao usuário.
- [ ] CRUD de cadastros funciona para o Supervisor.

**Ao concluir:** resumo + roteiro de teste guiado (logar com cada perfil e o que
fazer em cada um) e **parar**. Não iniciar a fase 4.
