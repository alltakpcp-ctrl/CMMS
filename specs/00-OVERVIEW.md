# 00 — OVERVIEW: como usar estas specs

Este diretório contém as instruções de build do CMMS, divididas por fase.
O contexto permanente (stack, modelo de dados, regras, RBAC) está em `../CLAUDE.md`.

## Como conduzir o build com o Claude Code

1. Abra o projeto no VS Code com o Claude Code.
2. Garanta que `CLAUDE.md` está na raiz — ele é lido automaticamente como contexto.
3. Peça ao Claude Code para executar **uma fase por vez**, na ordem:

   ```
   Leia CLAUDE.md e execute specs/01-fase-fundacao.md. Ao terminar, pare e me
   mostre um resumo + como testar. Não avance para a próxima fase.
   ```

4. Revise o resultado, teste, e só então peça a próxima fase.

## Ordem das fases

| Fase | Arquivo | Entrega |
|---|---|---|
| 1 | `01-fase-fundacao.md` | Projeto, Prisma schema, seed, auth + RBAC |
| 2 | `02-fase-ciclo-os.md` | API do ciclo da OS + máquina de estados (etapas 1–5) |
| 3 | `03-fase-frontend.md` | Todas as telas React conectadas à API |
| 4 | `04-fase-indicadores.md` | MTBF / MTTR / aderência + dashboard (etapa 6) |
| 5 | `05-fase-acabamento.md` | Validações, auditoria, seed de demo, testes |

## Definition of Done (global)

Uma fase só está concluída quando:

- [ ] O código compila sem erros de TypeScript.
- [ ] `npm run dev` sobe backend e frontend sem erros no console.
- [ ] As tarefas da spec estão todas implementadas.
- [ ] Os critérios de aceite específicos da fase foram atendidos.
- [ ] O Claude Code apresentou resumo + instruções de teste e **parou**.

## Princípios

- **Segurança de dados e permissões primeiro:** o backend valida tudo; o frontend
  só esconde o que o usuário não pode fazer.
- **Rastreabilidade:** toda mudança de status da OS vira registro em `StatusHistory`.
- **Fidelidade ao processo:** cada etapa do documento original corresponde a uma
  transição de status e a campos específicos (ver mapeamento abaixo).

## Mapeamento processo → sistema

| Etapa do documento | Status resultante | Campos preenchidos |
|---|---|---|
| 1. Abertura | ABERTA | type, title, description, requester, asset, number |
| 2. Triagem e Planejamento | TRIAGEM → PLANEJADA | priority, targetSector, plan |
| 3. Programação | PROGRAMADA | scheduledStart/End, assignedTo |
| 4. Execução | EM_EXECUCAO | riskAnalysis, startedAt, rootCause, repair, peças |
| 5. Encerramento e Validação | AGUARDANDO_VALIDACAO → ENCERRADA | testNotes, cleanupDone, finishedAt, baixa |
| 6. Indicadores | (pós-encerramento) | MTBF, MTTR, aderência, backlog |
