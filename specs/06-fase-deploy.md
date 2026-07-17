# 06 — FASE DEPLOY (Render + Vercel + Neon)

**Objetivo:** publicar o CMMS em produção com backend no Render, frontend no
Vercel e banco PostgreSQL no Neon, com deploy automático via Git push. SQLite
permanece exclusivamente para desenvolvimento local.

**Pré-requisitos:** fases 1–5 concluídas e testadas. Reler a "Decisão de produção"
no §2 do CLAUDE.md.

**Princípio central:** o código roda com SQLite localmente e Postgres em produção
SEM mudança de lógica — a diferença vive só em variáveis de ambiente. NÃO alterar a
lógica de negócio nesta fase; é infraestrutura e configuração.

---

## Tarefas

### 6.1 — Prisma compatível com os dois bancos
- No `schema.prisma`, tornar o `provider` do `datasource` configurável por env:
  usar `provider = env("DATABASE_PROVIDER")` **ou** manter dois arquivos de schema.
  Abordagem recomendada (mais simples e suportada): manter um único `schema.prisma`
  com `provider = "postgresql"` para produção e documentar que, para rodar local com
  SQLite, o dev troca o provider — OU, preferível, **padronizar produção e local em
  Postgres** para eliminar divergência (ver 6.2).
- **MANTER os campos de "enum" como `String`.** NÃO converter para enum nativo do
  Postgres. Isso mantém o schema idêntico entre bancos e a validação segue em
  `domain/enums.ts`. Alterar isso agora só adiciona risco de migração sem ganho real.
- Confirmar que nenhum tipo de coluna usado é específico de SQLite.

### 6.2 — Decisão sobre banco local (o Claude Code recomenda)
Há duas formas de conviver com SQLite-local + Postgres-produção. Avaliar e escolher,
justificando no resumo:
- **(a) Provider fixo em Postgres nos dois ambientes:** dev também usa um Postgres
  (um banco Neon de desenvolvimento gratuito, ou Postgres local via Docker).
  Vantagem: paridade total dev/prod, zero divergência de migração. É a prática
  recomendada para dados críticos.
- **(b) Provider alternável por env:** local segue SQLite, produção Postgres.
  Vantagem: dev continua zero-config. Risco: migrações precisam ser geradas/validadas
  contra Postgres, não só SQLite.
Recomendação padrão: **(a)** — com dados críticos, paridade dev/prod evita a classe
de bug "funcionou no SQLite, quebrou no Postgres". Se optar por (b), gerar e versionar
as migrações contra Postgres.

### 6.3 — Banco no Neon
- Criar projeto no Neon e obter a connection string (com `sslmode=require`).
- Rodar as migrações do Prisma contra o Neon:
  `prisma migrate deploy` (usa as migrações versionadas; NÃO usar `migrate dev` em
  produção).
- Rodar o seed **apenas** se for um ambiente de demonstração. Para produção real com
  dados verdadeiros, criar só os usuários iniciais necessários — NÃO popular com as
  20 OS de teste do seed de demo. Deixar isso claro e separar `seed` (dev/demo) de um
  eventual `seed:prod` mínimo (só usuários essenciais).

### 6.4 — Backend no Render
- Criar um Web Service Node apontando para o repositório (pasta `backend`).
- Build command: instalar deps + gerar Prisma Client + compilar TS
  (ex.: `npm install && npx prisma generate && npm run build`).
- Start command: rodar `prisma migrate deploy` e então iniciar o servidor
  (ex.: `npx prisma migrate deploy && npm run start`).
- **Variáveis de ambiente no Render:**
  - `DATABASE_URL` = connection string do Neon (com SSL).
  - `JWT_SECRET` = valor forte e único de produção (NUNCA o de dev). Gerar aleatório.
  - `NODE_ENV=production`.
  - `PORT` — usar a porta que o Render injeta (ler `process.env.PORT`; confirmar que
    `server.ts` respeita isso e não fixa 3333 em produção).
  - `CORS_ORIGIN` = URL do frontend no Vercel (ver 6.6).
- Habilitar auto-deploy no push da branch de produção.

### 6.5 — Frontend no Vercel
- Importar o repositório no Vercel apontando para a pasta `frontend`.
- Framework preset: Vite. Build: `npm run build`; output: `dist`.
- **Variável de ambiente** (prefixo do Vite, ex.: `VITE_API_URL`) = URL pública do
  backend no Render. Confirmar que o `src/api/client.ts` lê a base URL dessa env e
  não tem `localhost:3333` hardcoded.
- Habilitar auto-deploy no push.

### 6.6 — CORS e segurança
- Ajustar o CORS do backend (configurado na fase 1) para aceitar a origem do Vercel
  via `CORS_ORIGIN`, removendo/limitando `localhost` em produção.
- Confirmar que respostas nunca vazam `passwordHash` (já validado na fase 5, revalidar
  em produção).
- Garantir que o JWT usa o secret de produção e que tokens expiram.
- Servir tudo sobre HTTPS (Render e Vercel fornecem automaticamente).

### 6.7 — Backup e recuperação (CRÍTICO — dados importantes)
- Confirmar no painel do Neon: backup automático ativo e qual a janela de
  **point-in-time recovery** do plano escolhido. Documentar a retenção no README.
- **Testar uma restauração de verdade** pelo menos uma vez: criar dado, restaurar a um
  ponto anterior num branch do Neon, confirmar que funciona. Não confiar em backup não
  testado.
- Documentar o procedimento de restauração no README (passos concretos).

### 6.8 — Variáveis e documentação
- Atualizar `.env.example` do backend com as vars de produção (sem valores reais).
- Atualizar o `README.md` com uma seção "Deploy" descrevendo: arquitetura
  (Render/Vercel/Neon), variáveis de cada serviço, como rodar migração em produção,
  e o procedimento de backup/restauração.

---

## Critérios de aceite (Definition of Done)

- [ ] Backend no ar no Render, respondendo sobre HTTPS, conectado ao Neon.
- [ ] Migrações aplicadas no Neon via `migrate deploy`.
- [ ] Frontend no ar no Vercel, consumindo o backend via `VITE_API_URL`.
- [ ] Login funciona ponta a ponta em produção (frontend Vercel → backend Render →
      Neon).
- [ ] CORS aceita só a origem do Vercel; sem `localhost` liberado em produção.
- [ ] `JWT_SECRET` de produção é forte, único e vive só como env no Render.
- [ ] Nenhum segredo commitado no repositório.
- [ ] Auto-deploy via Git push confirmado nas duas plataformas.
- [ ] Backup do Neon confirmado e restauração testada ao menos uma vez.
- [ ] Produção NÃO contém as OS de teste do seed de demo (a menos que seja um
      ambiente de demonstração declarado).
- [ ] README com seção de Deploy completa.

**Ao concluir:** resumo com as URLs públicas, as variáveis configuradas em cada
serviço (sem valores secretos), e o resultado do teste de restauração de backup.

---

## Notas de segurança (importante)

- O Claude Code NÃO deve escrever segredos reais (connection strings, JWT secret) em
  nenhum arquivo versionado. Segredos vivem só nos painéis do Render/Vercel/Neon como
  variáveis de ambiente. Nos arquivos, apenas placeholders no `.env.example`.
- Se em algum momento uma connection string ou secret real for exposto (em log, commit
  ou chat), tratá-lo como comprometido: rotacionar imediatamente no provedor.
