import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { prisma } from "../config/prisma";
import { Role, WorkOrderType, Disciplina, Priority } from "../domain/enums";

// Fase 2 do plano de "exclusão lógica" (CLAUDE.md §5.2): cobre só a
// mecânica do novo endpoint POST /workorders/:id/excluir. Filtro de
// indicadores/listagens fica pra Fases 3/4 — não testado aqui.

let operadorToken: string;
let tecnicoToken: string;
let supervisorToken: string;
let assetId: string;
let sectorId: string;

async function login(email: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password: "senha123" });
  return res.body.token as string;
}

async function criarOSAberta(type: WorkOrderType, title: string, assetIdOverride?: string) {
  const res = await request(app)
    .post("/workorders")
    .set("Authorization", `Bearer ${operadorToken}`)
    .send({
      type,
      disciplina: Disciplina.ELETRICA,
      priority: Priority.MEDIA,
      title,
      description: "desc",
      assetId: assetIdOverride ?? assetId,
    });
  return res.body as { id: string; number: string; maintenancePlanId: string | null };
}

// PREVENTIVA reaproveita o plano existente por assetId+disciplina (ver
// workorders/service.ts#createWorkOrder) — cada teste de cascata usa um
// ativo próprio pra não vazar plano de um teste pro outro.
async function criarAtivoIsolado(sufixo: string): Promise<string> {
  const asset = await prisma.asset.create({
    data: { code: `TEST-EXC-${sufixo}`, name: `Ativo Exclusão ${sufixo}`, sectorId, location: "Bancada", criticality: 3 },
  });
  await prisma.assetSector.create({ data: { assetId: asset.id, sectorId } });
  return asset.id;
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash("senha123", 10);

  const [operador, tecnico, supervisor] = await Promise.all([
    prisma.user.create({
      data: { name: "Operador Exclusão", email: "op.exclusao.test@cmms.local", role: Role.OPERADOR, passwordHash },
    }),
    prisma.user.create({
      data: { name: "Técnico Exclusão", email: "tec.exclusao.test@cmms.local", role: Role.TECNICO, passwordHash },
    }),
    prisma.user.create({
      data: { name: "Supervisor Exclusão", email: "sup.exclusao.test@cmms.local", role: Role.SUPERVISOR, passwordHash },
    }),
  ]);

  const sector = await prisma.sector.create({ data: { name: "Setor Exclusão" } });
  sectorId = sector.id;

  const asset = await prisma.asset.create({
    data: { code: "TEST-EXC-01", name: "Ativo Exclusão", sectorId, location: "Bancada", criticality: 3 },
  });
  assetId = asset.id;
  // createWorkOrder exige o vínculo N:N (AssetSector), não só o sectorId
  // legado do Asset — sem isso, OPERADOR recebe 403 ASSET_OUT_OF_SECTOR.
  await prisma.assetSector.create({ data: { assetId: asset.id, sectorId } });

  await prisma.user.update({ where: { id: operador.id }, data: { sectorId } });

  operadorToken = await login(operador.email);
  tecnicoToken = await login(tecnico.email);
  supervisorToken = await login(supervisor.email);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("exclusão lógica de OS (POST /workorders/:id/excluir)", () => {
  it("SUPERVISOR exclui uma OS em ABERTA com sucesso e grava StatusHistory", async () => {
    const os = await criarOSAberta(WorkOrderType.CORRETIVA, "OS aberta por engano");

    const res = await request(app)
      .post(`/workorders/${os.id}/excluir`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ reason: "Duplicada — aberta duas vezes por engano." });

    expect(res.status).toBe(200);
    expect(res.body.excludedAt).not.toBeNull();
    expect(res.body.exclusionReason).toBe("Duplicada — aberta duas vezes por engano.");

    const history = await prisma.statusHistory.findFirst({
      where: { workOrderId: os.id, note: { contains: "[EXCLUSÃO]" } },
    });
    expect(history).not.toBeNull();
    expect(history?.fromStatus).toBe("ABERTA");
    expect(history?.toStatus).toBe("ABERTA");
  });

  it("rejeita exclusão sem motivo (400)", async () => {
    const os = await criarOSAberta(WorkOrderType.CORRETIVA, "OS sem motivo");

    const res = await request(app)
      .post(`/workorders/${os.id}/excluir`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("rejeita exclusão por TECNICO/OPERADOR (403)", async () => {
    const os = await criarOSAberta(WorkOrderType.CORRETIVA, "OS perfil errado");

    const resTecnico = await request(app)
      .post(`/workorders/${os.id}/excluir`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({ reason: "Tentativa indevida." });
    expect(resTecnico.status).toBe(403);

    const resOperador = await request(app)
      .post(`/workorders/${os.id}/excluir`)
      .set("Authorization", `Bearer ${operadorToken}`)
      .send({ reason: "Tentativa indevida." });
    expect(resOperador.status).toBe(403);
  });

  it("rejeita exclusão de OS que já saiu de ABERTA (422 WORK_ORDER_NOT_IN_INITIAL_PHASE)", async () => {
    const os = await criarOSAberta(WorkOrderType.CORRETIVA, "OS em triagem");
    await request(app)
      .post(`/workorders/${os.id}/triagem`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({ priority: Priority.ALTA, targetSectorId: sectorId });

    const res = await request(app)
      .post(`/workorders/${os.id}/excluir`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ reason: "Não deveria funcionar." });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("WORK_ORDER_NOT_IN_INITIAL_PHASE");
  });

  it("rejeita excluir a mesma OS duas vezes (409 ALREADY_EXCLUDED)", async () => {
    const os = await criarOSAberta(WorkOrderType.CORRETIVA, "OS excluída duas vezes");
    await request(app)
      .post(`/workorders/${os.id}/excluir`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ reason: "Primeira exclusão." });

    const res = await request(app)
      .post(`/workorders/${os.id}/excluir`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ reason: "Segunda tentativa." });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_EXCLUDED");
  });

  it("404 para OS inexistente", async () => {
    const res = await request(app)
      .post("/workorders/id-inexistente/excluir")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ reason: "Motivo qualquer." });

    expect(res.status).toBe(404);
  });

  it("exclui em cascata o plano rascunho quando esta é a única OS vinculada", async () => {
    const assetCascata = await criarAtivoIsolado("cascata");
    const os = await criarOSAberta(WorkOrderType.PREVENTIVA, "Preventiva aberta errada", assetCascata);
    expect(os.maintenancePlanId).toBeTruthy();

    const planAntes = await prisma.maintenancePlan.findUnique({ where: { id: os.maintenancePlanId! } });
    expect(planAntes?.periodicity).toBeNull(); // é rascunho

    const res = await request(app)
      .post(`/workorders/${os.id}/excluir`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ reason: "Preventiva aberta pro ativo errado." });
    expect(res.status).toBe(200);

    const planDepois = await prisma.maintenancePlan.findUnique({ where: { id: os.maintenancePlanId! } });
    expect(planDepois?.excludedAt).not.toBeNull();
    expect(planDepois?.exclusionReason).toContain(os.number);
  });

  it("NÃO exclui o plano rascunho quando outra OS ativa ainda está vinculada a ele", async () => {
    const assetCompartilhado = await criarAtivoIsolado("compartilhado");
    const os1 = await criarOSAberta(WorkOrderType.PREVENTIVA, "Preventiva 1 — mesmo ativo", assetCompartilhado);
    const planId = os1.maintenancePlanId!;

    // Segunda OS PREVENTIVA pro mesmo ativo+disciplina reaproveita o mesmo
    // plano rascunho (ver workorders/service.ts#createWorkOrder).
    const os2 = await criarOSAberta(WorkOrderType.PREVENTIVA, "Preventiva 2 — mesmo ativo", assetCompartilhado);
    expect(os2.maintenancePlanId).toBe(planId);

    const res = await request(app)
      .post(`/workorders/${os1.id}/excluir`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ reason: "Só a primeira era engano." });
    expect(res.status).toBe(200);

    const plan = await prisma.maintenancePlan.findUnique({ where: { id: planId } });
    expect(plan?.excludedAt).toBeNull();
  });
});
