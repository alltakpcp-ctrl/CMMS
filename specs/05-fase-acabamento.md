# 05 — FASE ACABAMENTO

**Objetivo:** endurecer o sistema para demonstração e uso inicial: validações
completas, auditoria consistente, seed de demonstração realista, testes de fluxo
e documentação de execução.

**Pré-requisitos:** fases 1–4 concluídas.

---

## Tarefas

### 5.1 — Validação e robustez
- Revisar todos os endpoints: validação de entrada com zod, mensagens de erro no
  formato padrão (§9), códigos HTTP corretos.
- Garantir que nenhuma resposta vaza `passwordHash` ou dados sensíveis.
- Tratamento de erros no frontend uniforme (toasts / mensagens inline).
- Estados de carregamento e vazios em todas as listas/telas.

### 5.2 — Auditoria e integridade
- Revisar que TODA transição grava StatusHistory corretamente.
- Garantir atomicidade (transações) nas operações que tocam múltiplas tabelas
  (baixa de peças, criação de execução, transições com efeitos colaterais).
- Impedir edição de OS ENCERRADA/CANCELADA (somente leitura).

### 5.2b — Paridade de CRUD de Usuários
Na fase 2, o módulo `users` expõe apenas `GET`/`POST /users` — não há `PUT`/`DELETE`.
Por isso o frontend (fase 3) tem apenas criação e listagem de usuários, enquanto
Ativos e Peças têm CRUD completo.

**O Claude Code decide o caminho**, seguindo este critério: se completar a paridade
couber com baixo risco dentro desta fase (poucos arquivos, sem tocar no ciclo da OS),
prefira a opção (b); caso contrário, faça a (a) e documente. Justifique a escolha no
resumo final.

- **(a) Manter assim** no MVP: usuários só são criados/listados pela UI; edição e
  desativação ficam a cargo do banco. Documentar a limitação no README.
- **(b) Completar a paridade:** adicionar `PUT /users/:id` (editar nome/role/active)
  e desativação via `active=false`. Ligar edição/desativação na tela de Cadastros →
  Usuários.

**Regra inegociável (vale para qualquer opção):** NUNCA remover fisicamente um
usuário. Desativação é sempre `active=false` (soft delete), porque `requesterId`,
`assignedToId` e `changedById` referenciam usuários no histórico e um hard delete
quebraria a integridade e a auditoria. Um usuário inativo não pode logar nem receber
novas atribuições, mas permanece visível no histórico das OS antigas.

### 5.3 — Seed de demonstração
- Criar um seed rico (`prisma/seed.ts` estendido ou `seed-demo.ts`) com:
  - usuários dos 3 perfis,
  - ~10 ativos variados,
  - ~15 peças,
  - ~20 OS distribuídas por TODOS os status, incluindo várias ENCERRADAS com
    `startedAt`/`finishedAt` realistas (para os indicadores renderizarem valores
    plausíveis de MTBF/MTTR e aderência).
- Documentar como rodar o seed de demo.

### 5.4 — Testes de fluxo
- Testes de integração cobrindo o caminho feliz completo (abrir → ... → encerrar)
  e ao menos 3 caminhos de erro (role errado, transição inválida, saldo de peça
  insuficiente).
- Manter/rodar os testes unitários da máquina de estados e dos indicadores.

### 5.5 — Documentação de execução
- `README.md` na raiz com:
  - pré-requisitos (Node LTS),
  - passos para instalar (backend e frontend),
  - como configurar `.env` a partir do `.env.example`,
  - como rodar migração e seed,
  - como subir back e front,
  - credenciais de demonstração,
  - visão geral das rotas principais.
- Breve nota sobre como migrar de SQLite para PostgreSQL no futuro (trocar
  `provider` + `DATABASE_URL`, rodar migração).

### 5.6 — Ganchos futuros (documentar, NÃO implementar)
- Deixar comentado/documentado onde entraria:
  - geração automática de OS preventiva por `Asset.preventivePeriodicityDays`,
  - perfil e fluxo de almoxarife com aprovação de retirada,
  - notificações.

---

## Critérios de aceite (Definition of Done)

- [ ] Todos os endpoints validados e com erros padronizados.
- [ ] OS encerrada/cancelada é imutável.
- [ ] Operações multi-tabela são transacionais.
- [ ] Seed de demo popula dados suficientes para o dashboard exibir indicadores
      plausíveis.
- [ ] Testes de fluxo (feliz + erros) passam.
- [ ] README permite a um novo dev subir tudo do zero seguindo os passos.
- [ ] Ganchos futuros documentados, sem implementação indevida.

**Ao concluir:** resumo final do sistema completo + checklist de tudo que foi
entregue nas 5 fases. Projeto pronto para demonstração do MVP.
