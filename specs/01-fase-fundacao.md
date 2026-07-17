# 01 — FASE FUNDAÇÃO

**Objetivo:** deixar o esqueleto do projeto rodando: monorepo simples (backend +
frontend), banco SQLite com Prisma, modelo de dados completo, seed inicial e
autenticação com controle de acesso por perfil (RBAC).

**Pré-requisitos:** ler `../CLAUDE.md` inteiro (§2, §4, §5, §9).

---

## Tarefas

### 1.1 — Estrutura do projeto
- Criar as pastas `/backend` e `/frontend` conforme §3 do CLAUDE.md.
- Inicializar cada uma com `package.json` próprio e TypeScript configurado.
- Backend: Express + Prisma + zod + bcrypt + jsonwebtoken + dayjs.
- Frontend: Vite + React + TypeScript + Tailwind.
- Adicionar scripts `dev`, `build`, `start` em cada `package.json`.
- Criar `.gitignore` (node_modules, dev.db, .env, dist).

### 1.2 — Banco e Prisma
- Configurar `datasource` com `provider = "sqlite"` e `DATABASE_URL="file:./dev.db"`.
- Criar `schema.prisma` com TODAS as entidades e enums do §5 e §6 do CLAUDE.md:
  User, Asset, Part, WorkOrder, Execution, WorkOrderPart, StatusHistory,
  e os enums Role, Sector, WorkOrderType, WorkOrderStatus, Priority.
- Definir relações e campos únicos corretamente.
- Rodar `prisma migrate dev --name init` e gerar o client.

### 1.3 — Seed inicial
- Criar `prisma/seed.ts` com dados mínimos para desenvolvimento:
  - 3 usuários, um de cada perfil (senhas conhecidas, ex.: `senha123`), com
    `passwordHash` gerado por bcrypt.
    - `operador@cmms.local` / OPERADOR
    - `tecnico@cmms.local` / TECNICO
    - `supervisor@cmms.local` / SUPERVISOR
  - 4–6 ativos variando setor e criticidade.
  - 8–10 peças de almoxarifado com saldo.
- Configurar `prisma db seed`.

### 1.4 — Config e infraestrutura backend
- `src/config/prisma.ts`: instancia e exporta o PrismaClient (singleton).
- `src/config/env.ts`: carrega e valida variáveis de ambiente (JWT_SECRET, etc).
- `src/app.ts`: Express com JSON, CORS (liberar o front em dev), rotas montadas.
- `src/server.ts`: sobe o servidor na porta de `.env` (default 3333).
- Middleware global de tratamento de erros no formato de erro do §9.
- Criar `.env.example` documentando as variáveis.

### 1.5 — Autenticação
- Módulo `auth`: rota `POST /auth/login` (email + senha → valida bcrypt → retorna
  JWT com `{ userId, role }` + dados básicos do usuário, sem passwordHash).
- Rota `GET /auth/me` (retorna usuário logado a partir do token).
- Middleware `authenticate`: valida o JWT e injeta `req.user`.

### 1.6 — RBAC
- Middleware `authorize(...roles)`: bloqueia se `req.user.role` não estiver na lista
  (403 no formato de erro padrão).
- Deixar helper pronto para uso nas rotas das fases seguintes.
- Criar uma rota protegida de teste (ex.: `GET /users` só para SUPERVISOR) para
  validar que o RBAC funciona ponta a ponta.

### 1.7 — Base do frontend
- Configurar Tailwind.
- Criar contexto de autenticação (`auth/AuthContext`) que guarda token + usuário,
  persiste o token em memória/localStorage e injeta o header Authorization.
- Criar wrapper de API em `src/api/client.ts` (base URL do backend via env do Vite).
- Criar tela de **Login** funcional que chama `POST /auth/login`.
- Criar um layout básico com guard de rota: se não autenticado, redireciona ao login.
- Após login, mostrar uma tela placeholder "Dashboard" exibindo nome e perfil do
  usuário (as telas reais vêm na fase 3).

---

## Critérios de aceite (Definition of Done)

- [ ] `prisma migrate` roda e cria `dev.db` com todas as tabelas.
- [ ] `prisma db seed` popula usuários, ativos e peças.
- [ ] Backend sobe em `npm run dev` sem erros.
- [ ] `POST /auth/login` com credenciais do seed retorna um JWT válido.
- [ ] `GET /auth/me` retorna o usuário logado (sem passwordHash).
- [ ] Rota protegida por RBAC retorna 403 para perfil não autorizado e 200 para o
      autorizado.
- [ ] Frontend sobe, exibe tela de login, autentica e mostra o placeholder de
      dashboard com nome/perfil.
- [ ] Nenhum segredo hardcoded; `.env.example` presente.

**Ao concluir:** apresentar resumo + comandos de teste (login via curl/console e
via UI) e **parar**. Não iniciar a fase 2.
