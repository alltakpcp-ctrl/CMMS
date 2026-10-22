import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { prisma } from "../config/prisma";
import { Disciplina, Priority, Role, WorkOrderType } from "../domain/enums";

// Regressões do diagnóstico de 2026-10-22 ("sistema perdendo histórico das
// OS"): vínculos de apoio apagados, duplicações e corridas de concorrência.

const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
let sectorId: string;
let assetId: string;
let partId: string;

async function login(email: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password: "senha123" });
  return res.body.token as string;
}

function as(who: string) {
  return {
    post: (url: string, body: object = {}) =>
      request(app).post(url).set("Authorization", `Bearer ${tokens[who]}`).send(body),
    patch: (url: string, body: object = {}) =>
      request(app).patch(url).set("Authorization", `Bearer ${tokens[who]}`).send(body),
    delete: (url: string) => request(app).delete(url).set("Authorization", `Bearer ${tokens[who]}`),
    get: (url: string) => request(app).get(url).set("Authorization", `Bearer ${tokens[who]}`),
  };
}

async function abrirOS(title: string, priority: Priority = Priority.MEDIA): Promise<string> {
  const res = await as("op").post("/workorders", {
    type: WorkOrderType.CORRETIVA,
    disciplina: Disciplina.MECANICA,
    priority,
    title,
    description: "desc",
    assetId,
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function levarAteProgramada(id: string, apoio: string[] = []) {
  await as("tec").post(`/workorders/${id}/triagem`, { priority: Priority.ALTA, targetSectorId: sectorId });
  await as("tec").post(`/workorders/${id}/planejamento`, { plan: "Plano." });
  const res = await as("sup").post(`/workorders/${id}/programacao`, {
    scheduledStart: new Date().toISOString(),
    scheduledEnd: new Date(Date.now() + 3600_000).toISOString(),
    assigneeIds: [ids.tec, ...apoio],
  });
  expect(res.status).toBe(200);
}

async function apoioDaOS(id: string): Promise<string[]> {
  const rows = await prisma.workOrderAssignee.findMany({ where: { workOrderId: id } });
  return rows.map((r) => r.userId);
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash("senha123", 10);
  const sector = await prisma.sector.create({ data: { name: "Setor Integridade" } });
  sectorId = sector.id;

  const defs: Array<[string, Role, object?]> = [
    ["op", Role.OPERADOR, { sectorId }],
    ["tec", Role.TECNICO],
    ["tec2", Role.TECNICO],
    ["tec3", Role.TECNICO],
    ["sup", Role.SUPERVISOR, { canManageStock: true }],
  ];
  for (const [key, role, extra] of defs) {
    const email = `${key}.integridade.test@cmms.local`;
    const user = await prisma.user.create({
      data: { name: `${key} integridade`, email, role, passwordHash, ...extra },
    });
    ids[key] = user.id;
    tokens[key] = await login(email);
  }

  const asset = await prisma.asset.create({
    data: { code: "TEST-INT-01", name: "Ativo Integridade", sectorId, location: "Bancada", criticality: 3 },
  });
  assetId = asset.id;
  await prisma.assetSector.create({ data: { assetId, sectorId } });

  const part = await prisma.part.create({
    data: { code: "TEST-INT-PC", description: "Peça integridade", unit: "un", stockQty: 10 },
  });
  partId = part.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("vínculos de apoio não são apagados", () => {
  it("iniciar sem reenviar apoio mantém o apoio definido na programação", async () => {
    const id = await abrirOS("Apoio da programação");
    await levarAteProgramada(id, [ids.tec2]);

    const res = await as("tec").post(`/workorders/${id}/iniciar`, { riskAnalysis: "risco" });
    expect(res.status).toBe(200);
    expect(await apoioDaOS(id)).toContain(ids.tec2);
  });

  it("devolver para PROGRAMADA e reiniciar mantém o coresponsável da subtask", async () => {
    const id = await abrirOS("Coresponsável de subtask");
    await levarAteProgramada(id);
    await as("tec").post(`/workorders/${id}/iniciar`, { riskAnalysis: "risco" });
    const subtask = await as("tec").post(`/workorders/${id}/subtasks`, {
      title: "Troca de rolamento",
      estimatedHours: 0.5,
      assignedToId: ids.tec3,
    });
    expect(subtask.status).toBe(201);

    const override = await as("sup").patch(`/workorders/${id}/timeline`, { toStatus: "PROGRAMADA", note: "voltar fase" });
    expect(override.status).toBe(200);
    const reinicio = await as("tec").post(`/workorders/${id}/iniciar`, { riskAnalysis: "risco 2" });
    expect(reinicio.status).toBe(200);

    expect(await apoioDaOS(id)).toContain(ids.tec3);
  });

  it("exclusão de usuário com participação em OS é bloqueada (não apaga o vínculo em cascata)", async () => {
    const passwordHash = await bcrypt.hash("senha123", 10);
    const apoio = await prisma.user.create({
      data: { name: "Apoio descartável", email: "apoio.descartavel.test@cmms.local", role: Role.TECNICO, passwordHash },
    });
    const id = await abrirOS("Exclusão de usuário de apoio");
    await levarAteProgramada(id, [apoio.id]);

    const res = await as("sup").delete(`/users/${apoio.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("USER_HAS_HISTORY");
    expect(await apoioDaOS(id)).toContain(apoio.id);
  });
});

describe("re-planejamento e re-triagem", () => {
  it("re-planejar após override substitui as peças planejadas em vez de duplicar", async () => {
    const id = await abrirOS("Replanejamento");
    await as("tec").post(`/workorders/${id}/triagem`, { priority: Priority.ALTA, targetSectorId: sectorId });
    await as("tec").post(`/workorders/${id}/planejamento`, { plan: "Plano 1", plannedParts: [{ partId, quantity: 2 }] });
    await as("sup").patch(`/workorders/${id}/timeline`, { toStatus: "TRIAGEM", note: "replanejar" });
    const res = await as("tec").post(`/workorders/${id}/planejamento`, {
      plan: "Plano 2",
      plannedParts: [{ partId, quantity: 3 }],
    });
    expect(res.status).toBe(200);

    const planned = await prisma.workOrderPlannedPart.findMany({ where: { workOrderId: id } });
    expect(planned).toHaveLength(1);
    expect(planned[0].quantity).toBe(3);
  });

  it("segunda triagem preserva a prioridade original da abertura", async () => {
    const id = await abrirOS("Re-triagem", Priority.MEDIA);
    await as("tec").post(`/workorders/${id}/triagem`, { priority: Priority.ALTA, targetSectorId: sectorId });
    await as("sup").patch(`/workorders/${id}/timeline`, { toStatus: "ABERTA", note: "re-triagem" });
    await as("tec").post(`/workorders/${id}/triagem`, { priority: Priority.URGENTE, targetSectorId: sectorId });

    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id } });
    expect(wo.priority).toBe(Priority.URGENTE);
    expect(wo.priorityOriginal).toBe(Priority.MEDIA);
  });
});

describe("contagem por status (Dashboard)", () => {
  it("conta além de 100 OS, bate com a listagem e ignora OS excluídas", async () => {
    // Base com mais de 100 OS do mesmo solicitante (criação direta no banco
    // para não depender de 100+ requisições).
    const requester = await prisma.user.findUniqueOrThrow({ where: { id: ids.op } });
    const last = await prisma.workOrder.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
    let seq = last ? Number(last.number.slice(-6)) : 0;
    await prisma.workOrder.createMany({
      data: Array.from({ length: 105 }, () => ({
        number: `OS-${new Date().getFullYear()}-${String(++seq).padStart(6, "0")}`,
        type: WorkOrderType.CORRETIVA,
        status: "ENCERRADA",
        priority: Priority.MEDIA,
        title: "Massa para contagem",
        description: "desc",
        assetId,
        requesterId: requester.id,
      })),
    });
    const excluida = await abrirOS("Excluída não conta");
    await as("sup").post(`/workorders/${excluida}/excluir`, { reason: "teste de contagem" });

    const filtro = `requesterId=${ids.op}`;
    const res = await as("sup").get(`/workorders/contagem-status?${filtro}`);
    expect(res.status).toBe(200);

    const encerradas = await as("sup").get(`/workorders?${filtro}&status=ENCERRADA&pageSize=1`);
    const todas = await as("sup").get(`/workorders?${filtro}&pageSize=1`);
    expect(res.body.ENCERRADA).toBeGreaterThan(100);
    expect(res.body.ENCERRADA).toBe(encerradas.body.total);
    const soma = Object.values(res.body as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(soma).toBe(todas.body.total);

    // O próprio operador também consegue (mesma visibilidade da listagem).
    const doOperador = await as("op").get(`/workorders/contagem-status?${filtro}`);
    expect(doOperador.status).toBe(200);
    expect(doOperador.body.ENCERRADA).toBe(res.body.ENCERRADA);
  });
});

describe("concorrência", () => {
  it("aberturas simultâneas de OS recebem números distintos, sem erro 500", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        as("op").post("/workorders", {
          type: WorkOrderType.CORRETIVA,
          disciplina: Disciplina.MECANICA,
          priority: Priority.MEDIA,
          title: `Simultânea ${i}`,
          description: "desc",
          assetId,
        })
      )
    );
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));
    expect(new Set(results.map((r) => r.body.number)).size).toBe(6);
  });

  it("aprovação simultânea da mesma baixa só debita o estoque uma vez", async () => {
    const id = await abrirOS("Baixa concorrente");
    await levarAteProgramada(id);
    await as("tec").post(`/workorders/${id}/iniciar`, { riskAnalysis: "risco" });
    const enc = await as("tec").post(`/workorders/${id}/encerramento-tecnico`, {
      testNotes: "ok",
      cleanupDone: true,
      parts: [{ partId, quantity: 1 }],
    });
    expect(enc.status).toBe(200);

    const pedido = await prisma.stockWithdrawalRequest.findFirstOrThrow({ where: { workOrderId: id } });
    const antes = (await prisma.part.findUniqueOrThrow({ where: { id: partId } })).stockQty;

    const results = await Promise.all(
      [1, 2].map(() => as("sup").post(`/stock-withdrawals/${pedido.id}/review`, { action: "APROVAR" }))
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);

    const depois = (await prisma.part.findUniqueOrThrow({ where: { id: partId } })).stockQty;
    const movimentos = await prisma.stockMovement.findMany({ where: { withdrawalRequestId: pedido.id } });
    expect(antes - depois).toBe(1);
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0].balanceAfter).toBe(depois);
  });
});
