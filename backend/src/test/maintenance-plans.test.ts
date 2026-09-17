import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { prisma } from "../config/prisma";
import {
  MaintenanceDiscipline,
  MaintenancePeriodicity,
  Priority,
  Role,
  WorkOrderStatus,
  WorkOrderType,
} from "../domain/enums";

let supervisorToken: string;
let requesterId: string;
let assetId: string;

async function login(email: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password: "senha123" });
  return res.body.token as string;
}

async function createPlan(): Promise<string> {
  const plan = await prisma.maintenancePlan.create({
    data: {
      assetId,
      discipline: MaintenanceDiscipline.MECANICA,
      title: "Plano de teste",
      priority: Priority.MEDIA,
      periodicity: MaintenancePeriodicity.SEMANAL,
    },
  });
  return plan.id;
}

async function createLinkedWorkOrder(maintenancePlanId: string, suffix: string) {
  await prisma.workOrder.create({
    data: {
      number: `OS-TEST-PLAN-${suffix}`,
      type: WorkOrderType.PREVENTIVA,
      priority: Priority.MEDIA,
      title: "OS de teste vinculada a plano",
      description: "desc",
      requesterId,
      assetId,
      maintenancePlanId,
    },
  });
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash("senha123", 10);

  const supervisor = await prisma.user.create({
    data: { name: "Supervisor Teste MP", email: "sup.mp.test@cmms.local", role: Role.SUPERVISOR, passwordHash },
  });
  requesterId = supervisor.id;

  const sector = await prisma.sector.create({ data: { name: "Setor de Teste MP" } });

  const asset = await prisma.asset.create({
    data: { code: "TEST-MP-01", name: "Ativo de Teste MP", sectorId: sector.id, location: "Bancada", criticality: 3 },
  });
  assetId = asset.id;

  supervisorToken = await login(supervisor.email);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /maintenance-plans", () => {
  it("expõe a OS em aberto do plano (openWorkOrder), com a data real de início programado", async () => {
    const planId = await createPlan();
    const scheduledStart = new Date("2026-10-01T13:00:00.000Z");
    const scheduledEnd = new Date("2026-10-01T15:00:00.000Z");

    const workOrder = await prisma.workOrder.create({
      data: {
        number: `OS-TEST-PLAN-OPEN-${planId}`,
        type: WorkOrderType.PREVENTIVA,
        priority: Priority.MEDIA,
        status: WorkOrderStatus.PROGRAMADA,
        title: "OS aberta vinculada a plano",
        description: "desc",
        requesterId,
        assetId,
        maintenancePlanId: planId,
        scheduledStart,
        scheduledEnd,
      },
    });

    const res = await request(app)
      .get("/maintenance-plans")
      .set("Authorization", `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    const plan = res.body.find((p: { id: string }) => p.id === planId);
    expect(plan.openWorkOrder).toMatchObject({
      id: workOrder.id,
      number: workOrder.number,
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
      status: WorkOrderStatus.PROGRAMADA,
    });
  });

  it("não expõe uma OS já ENCERRADA/CANCELADA como openWorkOrder", async () => {
    const planId = await createPlan();

    await prisma.workOrder.create({
      data: {
        number: `OS-TEST-PLAN-CLOSED-${planId}`,
        type: WorkOrderType.PREVENTIVA,
        priority: Priority.MEDIA,
        status: WorkOrderStatus.ENCERRADA,
        title: "OS encerrada vinculada a plano",
        description: "desc",
        requesterId,
        assetId,
        maintenancePlanId: planId,
      },
    });

    const res = await request(app)
      .get("/maintenance-plans")
      .set("Authorization", `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    const plan = res.body.find((p: { id: string }) => p.id === planId);
    expect(plan.openWorkOrder).toBeNull();
  });
});

describe("DELETE /maintenance-plans/:id", () => {
  it("bloqueia a exclusão de um plano com OS vinculadas e informa a contagem", async () => {
    const planId = await createPlan();
    await createLinkedWorkOrder(planId, "A");
    await createLinkedWorkOrder(planId, "B");

    const res = await request(app)
      .delete(`/maintenance-plans/${planId}`)
      .set("Authorization", `Bearer ${supervisorToken}`);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("MAINTENANCE_PLAN_HAS_WORK_ORDERS");
    expect(res.body.error.message).toContain("2 OS vinculada(s)");

    const stillExists = await prisma.maintenancePlan.findUnique({ where: { id: planId } });
    expect(stillExists).not.toBeNull();
  });

  it("permite a exclusão de um plano sem OS vinculadas", async () => {
    const planId = await createPlan();

    const res = await request(app)
      .delete(`/maintenance-plans/${planId}`)
      .set("Authorization", `Bearer ${supervisorToken}`);

    expect(res.status).toBe(204);

    const deleted = await prisma.maintenancePlan.findUnique({ where: { id: planId } });
    expect(deleted).toBeNull();
  });
});

// Exclusão lógica do plano (§5.2 do CLAUDE.md, ajuste 2026-09-17) — ao
// contrário do DELETE acima, funciona mesmo com OS vinculada e mata junto
// qualquer OS não-ENCERRADA do plano, sem nunca apagar linha nenhuma.
describe("POST /maintenance-plans/:id/excluir", () => {
  it("exclui o plano e cascateia pra OS não-ENCERRADA vinculada, sem tocar em OS já ENCERRADA", async () => {
    const planId = await createPlan();
    await createLinkedWorkOrder(planId, "ABERTA");
    const encerrada = await prisma.workOrder.create({
      data: {
        number: `OS-TEST-PLAN-ENC-${planId}`,
        type: WorkOrderType.PREVENTIVA,
        priority: Priority.MEDIA,
        status: WorkOrderStatus.ENCERRADA,
        title: "OS já encerrada",
        description: "desc",
        requesterId,
        assetId,
        maintenancePlanId: planId,
      },
    });

    const res = await request(app)
      .post(`/maintenance-plans/${planId}/excluir`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ reason: "Preventiva descontinuada." });

    expect(res.status).toBe(200);
    expect(res.body.excludedAt).not.toBeNull();

    const linked = await prisma.workOrder.findMany({ where: { maintenancePlanId: planId } });
    const aberta = linked.find((wo) => wo.id !== encerrada.id)!;
    expect(aberta.excludedAt).not.toBeNull();
    expect(aberta.exclusionReason).toContain("Preventiva descontinuada");

    const encerradaDepois = await prisma.workOrder.findUnique({ where: { id: encerrada.id } });
    expect(encerradaDepois?.excludedAt).toBeNull();
    expect(encerradaDepois?.status).toBe(WorkOrderStatus.ENCERRADA);
  });

  it("rejeita excluir o mesmo plano duas vezes (409 ALREADY_EXCLUDED)", async () => {
    const planId = await createPlan();

    await request(app)
      .post(`/maintenance-plans/${planId}/excluir`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ reason: "Primeira exclusão." });

    const res = await request(app)
      .post(`/maintenance-plans/${planId}/excluir`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ reason: "Segunda tentativa." });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_EXCLUDED");
  });

  it("rejeita sem motivo (400) e 404 para plano inexistente", async () => {
    const planId = await createPlan();

    const semMotivo = await request(app)
      .post(`/maintenance-plans/${planId}/excluir`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({});
    expect(semMotivo.status).toBe(400);

    const inexistente = await request(app)
      .post("/maintenance-plans/id-inexistente/excluir")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ reason: "Motivo qualquer." });
    expect(inexistente.status).toBe(404);
  });
});
