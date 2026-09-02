import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { prisma } from "../config/prisma";
import { MaintenanceDiscipline, MaintenancePeriodicity, Priority, Role, WorkOrderType } from "../domain/enums";

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
