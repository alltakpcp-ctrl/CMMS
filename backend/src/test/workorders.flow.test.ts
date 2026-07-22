import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { prisma } from "../config/prisma";
import { Role, WorkOrderType } from "../domain/enums";

let operadorToken: string;
let tecnicoToken: string;
let supervisorToken: string;
let assetId: string;
let partId: string;
let tecnicoId: string;
let sectorId: string;

async function login(email: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password: "senha123" });
  return res.body.token as string;
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash("senha123", 10);

  const [operador, tecnico, supervisor] = await Promise.all([
    prisma.user.create({
      data: { name: "Operador Teste", email: "op.flow.test@cmms.local", role: Role.OPERADOR, passwordHash },
    }),
    prisma.user.create({
      data: { name: "Técnico Teste", email: "tec.flow.test@cmms.local", role: Role.TECNICO, passwordHash },
    }),
    prisma.user.create({
      data: { name: "Supervisor Teste", email: "sup.flow.test@cmms.local", role: Role.SUPERVISOR, passwordHash },
    }),
  ]);
  tecnicoId = tecnico.id;

  const sector = await prisma.sector.create({ data: { name: "Setor de Teste" } });
  sectorId = sector.id;

  const asset = await prisma.asset.create({
    data: { code: "TEST-AT-01", name: "Ativo de Teste", sectorId, location: "Bancada de testes", criticality: 3 },
  });
  assetId = asset.id;

  // Operador só abre OS para ativos do próprio setor — mantém o ativo acima no mesmo setor.
  await prisma.user.update({ where: { id: operador.id }, data: { sectorId } });

  const part = await prisma.part.create({
    data: { code: "TEST-PC-01", description: "Peça de teste", unit: "un", stockQty: 2 },
  });
  partId = part.id;

  operadorToken = await login(operador.email);
  tecnicoToken = await login(tecnico.email);
  supervisorToken = await login(supervisor.email);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("fluxo completo da OS (caminho feliz)", () => {
  it("percorre abertura -> triagem -> planejamento -> programação -> execução -> validação -> ENCERRADA", async () => {
    const created = await request(app)
      .post("/workorders")
      .set("Authorization", `Bearer ${operadorToken}`)
      .send({ type: WorkOrderType.CORRETIVA, title: "Falha de teste", description: "Descrição de teste.", assetId });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("ABERTA");
    expect(created.body.number).toMatch(/^OS-\d{4}-\d{6}$/);
    const id = created.body.id;

    const triagem = await request(app)
      .post(`/workorders/${id}/triagem`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({ priority: "ALTA", targetSectorId: sectorId });
    expect(triagem.status).toBe(200);
    expect(triagem.body.status).toBe("TRIAGEM");

    const planejamento = await request(app)
      .post(`/workorders/${id}/planejamento`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({ plan: "Plano de teste." });
    expect(planejamento.status).toBe(200);
    expect(planejamento.body.status).toBe("PLANEJADA");

    const programacao = await request(app)
      .post(`/workorders/${id}/programacao`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600_000).toISOString(),
        assignedToId: tecnicoId,
      });
    expect(programacao.status).toBe(200);
    expect(programacao.body.status).toBe("PROGRAMADA");

    const iniciar = await request(app)
      .post(`/workorders/${id}/iniciar`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({ riskAnalysis: "Análise de risco de teste." });
    expect(iniciar.status).toBe(200);
    expect(iniciar.body.status).toBe("EM_EXECUCAO");
    expect(iniciar.body.execution.startedAt).toBeTruthy();

    const registrar = await request(app)
      .post(`/workorders/${id}/registrar`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({
        rootCause: "Causa raiz de teste.",
        repairDescription: "Reparo de teste.",
        parts: [{ partId, quantity: 1 }],
      });
    expect(registrar.status).toBe(200);
    expect(registrar.body.status).toBe("EM_EXECUCAO");
    expect(registrar.body.parts).toHaveLength(1);

    const partAfter = await prisma.part.findUniqueOrThrow({ where: { id: partId } });
    expect(partAfter.stockQty).toBe(1);

    const encerramento = await request(app)
      .post(`/workorders/${id}/encerramento-tecnico`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({ testNotes: "Testado com sucesso.", cleanupDone: true });
    expect(encerramento.status).toBe(200);
    expect(encerramento.body.status).toBe("AGUARDANDO_VALIDACAO");
    expect(encerramento.body.execution.finishedAt).toBeTruthy();

    const validar = await request(app)
      .post(`/workorders/${id}/validar`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ approve: true });
    expect(validar.status).toBe(200);
    expect(validar.body.status).toBe("ENCERRADA");

    const detail = await request(app).get(`/workorders/${id}`).set("Authorization", `Bearer ${operadorToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.statusHistory).toHaveLength(7);
    expect(detail.body.statusHistory[0].fromStatus).toBeNull();
    expect(detail.body.statusHistory[0].toStatus).toBe("ABERTA");
    expect(detail.body.statusHistory.at(-1).toStatus).toBe("ENCERRADA");

    // OS encerrada é imutável: nenhuma transição adicional é aceita.
    const afterClose = await request(app)
      .post(`/workorders/${id}/triagem`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({ priority: "BAIXA", targetSectorId: sectorId });
    expect(afterClose.status).toBe(409);
  });
});

describe("caminhos de erro", () => {
  it("rejeita transição feita por perfil sem permissão (403)", async () => {
    const created = await request(app)
      .post("/workorders")
      .set("Authorization", `Bearer ${operadorToken}`)
      .send({ type: WorkOrderType.CORRETIVA, title: "Erro de role", description: "desc", assetId });
    const id = created.body.id;

    const res = await request(app)
      .post(`/workorders/${id}/triagem`)
      .set("Authorization", `Bearer ${operadorToken}`) // OPERADOR não pode triar
      .send({ priority: "ALTA", targetSectorId: sectorId });

    // Bloqueado pelo middleware authorize() da rota (RBAC de perfil), antes
    // mesmo de chegar na máquina de estados — por isso o código é o genérico
    // FORBIDDEN, e não o ROLE_FORBIDDEN específico do canTransition.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejeita transição de estado inválida (409)", async () => {
    const created = await request(app)
      .post("/workorders")
      .set("Authorization", `Bearer ${operadorToken}`)
      .send({ type: WorkOrderType.CORRETIVA, title: "Erro de transição", description: "desc", assetId });
    const id = created.body.id;

    // ABERTA -> PROGRAMADA pulando etapas obrigatórias.
    const res = await request(app)
      .post(`/workorders/${id}/programacao`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600_000).toISOString(),
        assignedToId: tecnicoId,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("rejeita registro de peça com saldo insuficiente (422)", async () => {
    const created = await request(app)
      .post("/workorders")
      .set("Authorization", `Bearer ${operadorToken}`)
      .send({ type: WorkOrderType.CORRETIVA, title: "Erro de estoque", description: "desc", assetId });
    const id = created.body.id;

    await request(app)
      .post(`/workorders/${id}/triagem`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({ priority: "ALTA", targetSectorId: sectorId });
    await request(app)
      .post(`/workorders/${id}/planejamento`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({ plan: "Plano." });
    await request(app)
      .post(`/workorders/${id}/programacao`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3600_000).toISOString(),
        assignedToId: tecnicoId,
      });
    await request(app)
      .post(`/workorders/${id}/iniciar`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({ riskAnalysis: "risco" });

    const res = await request(app)
      .post(`/workorders/${id}/registrar`)
      .set("Authorization", `Bearer ${tecnicoToken}`)
      .send({
        rootCause: "causa",
        repairDescription: "reparo",
        parts: [{ partId, quantity: 9999 }],
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
  });
});
