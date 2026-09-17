import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { prisma } from "../config/prisma";
import { Role, WorkOrderType, Disciplina, Priority } from "../domain/enums";

// Fase 5 do plano de "exclusão lógica" (CLAUDE.md §5.2): endpoint do Baú
// (GET /workorders/bau) + o guard "OS excluída fica congelada" adicionado
// em applyTransition/reprogramacao/timelineOverride junto com esta fase.

let operadorToken: string;
let tecnicoToken: string;
let supervisorToken: string;
let assetId: string;
let sectorId: string;

async function login(email: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password: "senha123" });
  return res.body.token as string;
}

async function criarOSAberta(title: string) {
  const res = await request(app)
    .post("/workorders")
    .set("Authorization", `Bearer ${operadorToken}`)
    .send({ type: WorkOrderType.CORRETIVA, disciplina: Disciplina.ELETRICA, priority: Priority.MEDIA, title, description: "desc", assetId });
  return res.body as { id: string; number: string };
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash("senha123", 10);
  const [operador, tecnico, supervisor] = await Promise.all([
    prisma.user.create({
      data: { name: "Operador Bau", email: "op.bau.test@cmms.local", role: Role.OPERADOR, passwordHash },
    }),
    prisma.user.create({
      data: { name: "Técnico Bau", email: "tec.bau.test@cmms.local", role: Role.TECNICO, passwordHash },
    }),
    prisma.user.create({
      data: { name: "Supervisor Bau", email: "sup.bau.test@cmms.local", role: Role.SUPERVISOR, passwordHash },
    }),
  ]);
  const sector = await prisma.sector.create({ data: { name: "Setor Bau" } });
  sectorId = sector.id;
  const asset = await prisma.asset.create({
    data: { code: "TEST-BAU-01", name: "Ativo Bau", sectorId, location: "Bancada", criticality: 3 },
  });
  assetId = asset.id;
  await prisma.assetSector.create({ data: { assetId: asset.id, sectorId } });
  await prisma.user.update({ where: { id: operador.id }, data: { sectorId } });

  operadorToken = await login(operador.email);
  tecnicoToken = await login(tecnico.email);
  supervisorToken = await login(supervisor.email);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /workorders/bau", () => {
  it("retorna OS excluída com bauInfo.kind=EXCLUIDA, motivo e autor corretos", async () => {
    const os = await criarOSAberta("Bau - excluida");
    await request(app)
      .post(`/workorders/${os.id}/excluir`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ reason: "Motivo da exclusão." });

    const res = await request(app).get("/workorders/bau?pageSize=100").set("Authorization", `Bearer ${supervisorToken}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((wo: { id: string }) => wo.id === os.id);
    expect(item).toBeTruthy();
    expect(item.bauInfo.kind).toBe("EXCLUIDA");
    expect(item.bauInfo.reason).toBe("Motivo da exclusão.");
    expect(item.bauInfo.by?.email).toBe("sup.bau.test@cmms.local");
  });

  it("retorna OS cancelada com bauInfo.kind=CANCELADA e o note do cancelamento", async () => {
    const os = await criarOSAberta("Bau - cancelada");
    await request(app)
      .post(`/workorders/${os.id}/cancelar`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ note: "Motivo do cancelamento." });

    const res = await request(app).get("/workorders/bau?pageSize=100").set("Authorization", `Bearer ${supervisorToken}`);
    const item = res.body.items.find((wo: { id: string }) => wo.id === os.id);
    expect(item).toBeTruthy();
    expect(item.bauInfo.kind).toBe("CANCELADA");
    expect(item.bauInfo.reason).toBe("Motivo do cancelamento.");
  });

  it("NÃO retorna OS ativa (ABERTA)", async () => {
    const os = await criarOSAberta("Bau - ativa nao aparece");
    const res = await request(app).get("/workorders/bau?pageSize=100").set("Authorization", `Bearer ${supervisorToken}`);
    expect(res.body.items.some((wo: { id: string }) => wo.id === os.id)).toBe(false);
  });

  it("rejeita TECNICO/OPERADOR (403)", async () => {
    const resTec = await request(app).get("/workorders/bau").set("Authorization", `Bearer ${tecnicoToken}`);
    expect(resTec.status).toBe(403);
    const resOp = await request(app).get("/workorders/bau").set("Authorization", `Bearer ${operadorToken}`);
    expect(resOp.status).toBe(403);
  });
});

describe("OS excluída fica congelada (guard adicionado na Fase 5)", () => {
  it("cancelar() rejeita OS já excluída (409 ALREADY_EXCLUDED)", async () => {
    const os = await criarOSAberta("Congelada - cancelar");
    await request(app).post(`/workorders/${os.id}/excluir`).set("Authorization", `Bearer ${supervisorToken}`).send({ reason: "x" });

    const res = await request(app)
      .post(`/workorders/${os.id}/cancelar`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ note: "não deveria funcionar" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_EXCLUDED");
  });

  it("triagem() (via applyTransition) rejeita OS já excluída", async () => {
    const os = await criarOSAberta("Congelada - triagem");
    await request(app).post(`/workorders/${os.id}/excluir`).set("Authorization", `Bearer ${supervisorToken}`).send({ reason: "x" });

    const res = await request(app)
      .post(`/workorders/${os.id}/triagem`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({ priority: Priority.ALTA, targetSectorId: sectorId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_EXCLUDED");
  });

  it("reprogramacao() rejeita OS já excluída", async () => {
    const os = await criarOSAberta("Congelada - reprogramacao");
    await request(app).post(`/workorders/${os.id}/excluir`).set("Authorization", `Bearer ${supervisorToken}`).send({ reason: "x" });

    const res = await request(app)
      .patch(`/workorders/${os.id}/programacao`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ scheduledStart: new Date().toISOString() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_EXCLUDED");
  });

  it("timelineOverride rejeita OS já excluída", async () => {
    const os = await criarOSAberta("Congelada - override");
    await request(app).post(`/workorders/${os.id}/excluir`).set("Authorization", `Bearer ${supervisorToken}`).send({ reason: "x" });

    const res = await request(app)
      .patch(`/workorders/${os.id}/timeline`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ toStatus: "TRIAGEM", note: "override indevido" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_EXCLUDED");
  });
});
