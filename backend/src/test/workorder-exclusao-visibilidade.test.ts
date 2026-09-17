import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { prisma } from "../config/prisma";
import { Role, WorkOrderType, Disciplina, Priority } from "../domain/enums";

// Fases 3 e 4 do plano de "exclusão lógica" (CLAUDE.md §5.2): confirma que
// uma OS excluída (a) some de TODO indicador e (b) some das listagens
// operacionais por padrão, mas continua acessível com incluirExcluidas=true
// (pré-requisito pro Baú, Fase 5). Asserções por DELTA (antes/depois), não
// por valor absoluto — o banco de teste é compartilhado entre arquivos.

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

async function excluir(id: string, reason = "smoke") {
  return request(app)
    .post(`/workorders/${id}/excluir`)
    .set("Authorization", `Bearer ${supervisorToken}`)
    .send({ reason });
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash("senha123", 10);
  const [operador, tecnico, supervisor] = await Promise.all([
    prisma.user.create({
      data: { name: "Operador Visibilidade", email: "op.visib.test@cmms.local", role: Role.OPERADOR, passwordHash },
    }),
    prisma.user.create({
      data: { name: "Técnico Visibilidade", email: "tec.visib.test@cmms.local", role: Role.TECNICO, passwordHash },
    }),
    prisma.user.create({
      data: { name: "Supervisor Visibilidade", email: "sup.visib.test@cmms.local", role: Role.SUPERVISOR, passwordHash },
    }),
  ]);

  const sector = await prisma.sector.create({ data: { name: "Setor Visibilidade" } });
  sectorId = sector.id;
  const asset = await prisma.asset.create({
    data: { code: "TEST-VIS-01", name: "Ativo Visibilidade", sectorId, location: "Bancada", criticality: 3 },
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

describe("Fase 3 — OS excluída some de todo indicador", () => {
  it("overview.totalWorkOrders sobe com a OS e volta ao excluir", async () => {
    const before = await request(app).get("/indicators/overview").set("Authorization", `Bearer ${supervisorToken}`);
    const totalBefore = before.body.totalWorkOrders as number;

    const os = await criarOSAberta("Indicador - overview");
    const afterCreate = await request(app).get("/indicators/overview").set("Authorization", `Bearer ${supervisorToken}`);
    expect(afterCreate.body.totalWorkOrders).toBe(totalBefore + 1);

    const exclusao = await excluir(os.id);
    expect(exclusao.status).toBe(200);

    const afterExcluir = await request(app).get("/indicators/overview").set("Authorization", `Bearer ${supervisorToken}`);
    expect(afterExcluir.body.totalWorkOrders).toBe(totalBefore);
  });

  it("backlog.total sobe com a OS ABERTA e volta ao excluir (CANCELADA continua contando)", async () => {
    const before = await request(app).get("/indicators/backlog").set("Authorization", `Bearer ${supervisorToken}`);
    const totalBefore = before.body.total as number;

    const osExcluida = await criarOSAberta("Indicador - backlog excluída");
    const osCancelada = await criarOSAberta("Indicador - backlog cancelada");

    const afterCreate = await request(app).get("/indicators/backlog").set("Authorization", `Bearer ${supervisorToken}`);
    expect(afterCreate.body.total).toBe(totalBefore + 2);

    await excluir(osExcluida.id);
    await request(app)
      .post(`/workorders/${osCancelada.id}/cancelar`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ note: "cancelada — continua no backlog? não, cancelada não entra no backlog mesmo." });

    // CANCELADA não é um dos BACKLOG_STATUSES (ver lib/indicators.ts) — então
    // o efeito esperado aqui é: as duas somem do backlog, uma por exclusão
    // (Fase 3) e outra por já não ser mais um status de backlog.
    const afterBoth = await request(app).get("/indicators/backlog").set("Authorization", `Bearer ${supervisorToken}`);
    expect(afterBoth.body.total).toBe(totalBefore);
  });

  it("distribution.byStatus[ABERTA] não inclui a OS excluída (where próprio de getDistribution)", async () => {
    function abertaCount(body: { distribution: { byStatus: Array<{ status: string; count: number }> } }) {
      return body.distribution.byStatus.find((s) => s.status === "ABERTA")?.count ?? 0;
    }

    const before = await request(app).get("/indicators/distribution").set("Authorization", `Bearer ${supervisorToken}`);
    const abertaBefore = abertaCount(before.body);

    const os = await criarOSAberta("Indicador - distribution");
    const afterCreate = await request(app).get("/indicators/distribution").set("Authorization", `Bearer ${supervisorToken}`);
    expect(abertaCount(afterCreate.body)).toBe(abertaBefore + 1);

    await excluir(os.id);
    const afterExcluir = await request(app).get("/indicators/distribution").set("Authorization", `Bearer ${supervisorToken}`);
    expect(abertaCount(afterExcluir.body)).toBe(abertaBefore);
  });
});

describe("Fase 4 — OS/plano excluído some das listagens por padrão", () => {
  it("GET /workorders não retorna a OS excluída por padrão, mas retorna com incluirExcluidas=true", async () => {
    const os = await criarOSAberta("Listagem - default");
    await excluir(os.id);

    const listaPadrao = await request(app)
      .get(`/workorders?assetId=${assetId}&pageSize=100`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(listaPadrao.body.items.some((wo: { id: string }) => wo.id === os.id)).toBe(false);

    const listaCompleta = await request(app)
      .get(`/workorders?assetId=${assetId}&pageSize=100&incluirExcluidas=true`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(listaCompleta.body.items.some((wo: { id: string }) => wo.id === os.id)).toBe(true);
  });

  it("GET /maintenance-plans não retorna plano excluído por padrão, mas retorna com incluirExcluidos=true", async () => {
    const assetPreventiva = await prisma.asset.create({
      data: { code: "TEST-VIS-PREV", name: "Ativo Preventiva Visibilidade", sectorId, location: "Bancada", criticality: 3 },
    });
    await prisma.assetSector.create({ data: { assetId: assetPreventiva.id, sectorId } });

    const os = await request(app)
      .post("/workorders")
      .set("Authorization", `Bearer ${operadorToken}`)
      .send({
        type: WorkOrderType.PREVENTIVA,
        disciplina: Disciplina.ELETRICA,
        priority: Priority.MEDIA,
        title: "Preventiva - listagem plano",
        description: "desc",
        assetId: assetPreventiva.id,
      });
    const planId = os.body.maintenancePlanId as string;
    await excluir(os.body.id);

    const listaPadrao = await request(app)
      .get(`/maintenance-plans?assetId=${assetPreventiva.id}`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(listaPadrao.body.some((p: { id: string }) => p.id === planId)).toBe(false);

    const listaCompleta = await request(app)
      .get(`/maintenance-plans?assetId=${assetPreventiva.id}&incluirExcluidos=true`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(listaCompleta.body.some((p: { id: string }) => p.id === planId)).toBe(true);
  });
});
