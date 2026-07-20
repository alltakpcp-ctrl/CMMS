// Seed de DEMONSTRAÇÃO — popula o banco com um conjunto rico e realista de
// dados para que o dashboard de indicadores (fase 4) mostre valores plausíveis
// de MTBF/MTTR/aderência/backlog.
//
// Diferente de `prisma/seed.ts` (seed mínima de desenvolvimento, usada por
// `prisma db seed`), este script é executado manualmente:
//
//   npx ts-node prisma/seed-demo.ts
//
// É IDEMPOTENTE e DESTRUTIVO apenas para dados transacionais de OS: toda vez
// que roda, apaga todas as WorkOrder/Execution/StatusHistory/WorkOrderPart
// existentes e recria o conjunto de demonstração do zero. Usuários, ativos e
// peças são apenas upsertados (nunca removidos). Não rode em produção.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { Priority, Role, WorkOrderStatus, WorkOrderType } from "../src/domain/enums";

const prisma = new PrismaClient();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date();

function daysAgo(n: number): Date {
  return new Date(now.getTime() - n * DAY);
}
function plus(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR);
}

const STATUS_CHAIN: WorkOrderStatus[] = [
  WorkOrderStatus.ABERTA,
  WorkOrderStatus.TRIAGEM,
  WorkOrderStatus.PLANEJADA,
  WorkOrderStatus.PROGRAMADA,
  WorkOrderStatus.EM_EXECUCAO,
  WorkOrderStatus.AGUARDANDO_VALIDACAO,
  WorkOrderStatus.ENCERRADA,
];

async function main() {
  const passwordHash = await bcrypt.hash("senha123", 10);

  const [operador, tecnico, supervisor] = await Promise.all([
    prisma.user.upsert({
      where: { email: "operador@cmms.local" },
      update: {},
      create: { name: "Operador Padrão", email: "operador@cmms.local", role: Role.OPERADOR, passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "tecnico@cmms.local" },
      update: {},
      create: { name: "Técnico Padrão", email: "tecnico@cmms.local", role: Role.TECNICO, passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "supervisor@cmms.local" },
      update: {},
      create: { name: "Supervisor Padrão", email: "supervisor@cmms.local", role: Role.SUPERVISOR, passwordHash },
    }),
  ]);

  const sectorNames = ["Mecânica", "Elétrica", "Predial"] as const;
  const sectorsByName = new Map<string, Awaited<ReturnType<typeof prisma.sector.upsert>>>();
  for (const name of sectorNames) {
    const sector = await prisma.sector.upsert({ where: { name }, update: {}, create: { name } });
    sectorsByName.set(name, sector);
  }
  const mecanica = sectorsByName.get("Mecânica")!.id;
  const eletrica = sectorsByName.get("Elétrica")!.id;
  const predial = sectorsByName.get("Predial")!.id;

  const assetDefs = [
    { code: "AT-001", name: "Compressor de Ar 01", sectorId: mecanica, location: "Sala de Máquinas", criticality: 5 },
    { code: "AT-002", name: "Painel Elétrico Principal", sectorId: eletrica, location: "Subestação", criticality: 5 },
    { code: "AT-003", name: "Esteira Transportadora 03", sectorId: mecanica, location: "Linha 3", criticality: 3 },
    { code: "AT-004", name: "Sistema de Climatização", sectorId: predial, location: "Bloco Administrativo", criticality: 2 },
    { code: "AT-005", name: "Motor de Indução 15cv", sectorId: eletrica, location: "Linha 1", criticality: 4 },
    { code: "AT-006", name: "Portão Automático", sectorId: predial, location: "Entrada Principal", criticality: 1 },
    { code: "AT-007", name: "Bomba Hidráulica 02", sectorId: mecanica, location: "Linha 2", criticality: 4 },
    { code: "AT-008", name: "Quadro de Distribuição Secundário", sectorId: eletrica, location: "Bloco B", criticality: 3 },
    { code: "AT-009", name: "Elevador de Carga", sectorId: predial, location: "Galpão 2", criticality: 3 },
    { code: "AT-010", name: "Torre de Resfriamento", sectorId: mecanica, location: "Área Externa", criticality: 4 },
  ];

  const assetsByCode = new Map<string, Awaited<ReturnType<typeof prisma.asset.upsert>>>();
  for (const def of assetDefs) {
    const asset = await prisma.asset.upsert({ where: { code: def.code }, update: def, create: def });
    assetsByCode.set(def.code, asset);
  }

  const partDefs = [
    { code: "PC-001", description: "Rolamento 6205", unit: "un", stockQty: 20 },
    { code: "PC-002", description: "Correia V A-45", unit: "un", stockQty: 15 },
    { code: "PC-003", description: "Óleo lubrificante ISO 68", unit: "L", stockQty: 50 },
    { code: "PC-004", description: "Disjuntor tripolar 32A", unit: "un", stockQty: 10 },
    { code: "PC-005", description: "Cabo flexível 2,5mm²", unit: "m", stockQty: 200 },
    { code: "PC-006", description: "Filtro de ar comprimido", unit: "un", stockQty: 12 },
    { code: "PC-007", description: "Contator 3TF 40A", unit: "un", stockQty: 8 },
    { code: "PC-008", description: "Vedação de borracha", unit: "m", stockQty: 30 },
    { code: "PC-009", description: "Lâmpada LED 20W", unit: "un", stockQty: 40 },
    { code: "PC-010", description: "Graxa industrial", unit: "kg", stockQty: 25 },
    { code: "PC-011", description: "Rolamento 6304", unit: "un", stockQty: 18 },
    { code: "PC-012", description: "Correia V B-60", unit: "un", stockQty: 10 },
    { code: "PC-013", description: "Sensor de temperatura", unit: "un", stockQty: 6 },
    { code: "PC-014", description: "Fusível NH 63A", unit: "un", stockQty: 25 },
    { code: "PC-015", description: "Selo mecânico", unit: "un", stockQty: 14 },
  ];

  const partsByCode = new Map<string, Awaited<ReturnType<typeof prisma.part.upsert>>>();
  for (const def of partDefs) {
    const part = await prisma.part.upsert({ where: { code: def.code }, update: def, create: def });
    partsByCode.set(def.code, part);
  }

  console.log("Limpando OS de demonstração anteriores...");
  await prisma.workOrderPart.deleteMany();
  await prisma.statusHistory.deleteMany();
  await prisma.execution.deleteMany();
  await prisma.workOrder.deleteMany();

  let seq = 900;
  function nextNumber(): string {
    return `OS-2026-${String(seq++).padStart(6, "0")}`;
  }

  function actorFor(status: WorkOrderStatus): string {
    switch (status) {
      case WorkOrderStatus.ABERTA:
        return operador.id;
      case WorkOrderStatus.TRIAGEM:
      case WorkOrderStatus.PLANEJADA:
      case WorkOrderStatus.EM_EXECUCAO:
      case WorkOrderStatus.AGUARDANDO_VALIDACAO:
        return tecnico.id;
      case WorkOrderStatus.PROGRAMADA:
      case WorkOrderStatus.ENCERRADA:
      case WorkOrderStatus.CANCELADA:
        return supervisor.id;
    }
  }

  interface HistoryStep {
    toStatus: WorkOrderStatus;
    changedById: string;
    changedAt: Date;
    note?: string;
  }

  function linearHistory(uptoStatus: WorkOrderStatus, startAt: Date, stepHours: number): HistoryStep[] {
    const uptoIndex = STATUS_CHAIN.indexOf(uptoStatus);
    return STATUS_CHAIN.slice(0, uptoIndex + 1).map((status, i) => ({
      toStatus: status,
      changedById: actorFor(status),
      changedAt: plus(startAt, i * stepHours),
    }));
  }

  interface DemoSpec {
    type: WorkOrderType;
    title: string;
    description: string;
    assetCode: string;
    createdAt: Date;
    finalStatus: WorkOrderStatus;
    priority?: Priority;
    targetSectorId?: string;
    plan?: string;
    scheduledStart?: Date;
    scheduledEnd?: Date;
    assignedToId?: string;
    execution?: {
      riskAnalysis?: string;
      startedAt?: Date;
      rootCause?: string;
      repairDescription?: string;
      finishedAt?: Date;
      testNotes?: string;
      cleanupDone?: boolean;
    };
    parts?: Array<{ partCode: string; quantity: number }>;
    history: HistoryStep[];
  }

  async function createDemoWorkOrder(spec: DemoSpec) {
    const asset = assetsByCode.get(spec.assetCode)!;
    const number = nextNumber();

    const wo = await prisma.workOrder.create({
      data: {
        number,
        type: spec.type,
        status: spec.finalStatus,
        title: spec.title,
        description: spec.description,
        assetId: asset.id,
        requesterId: operador.id,
        priority: spec.priority,
        targetSectorId: spec.targetSectorId,
        plan: spec.plan,
        scheduledStart: spec.scheduledStart,
        scheduledEnd: spec.scheduledEnd,
        assignedToId: spec.assignedToId,
        createdAt: spec.createdAt,
      },
    });

    if (spec.execution) {
      await prisma.execution.create({
        data: {
          workOrderId: wo.id,
          riskAnalysis: spec.execution.riskAnalysis,
          startedAt: spec.execution.startedAt,
          rootCause: spec.execution.rootCause,
          repairDescription: spec.execution.repairDescription,
          finishedAt: spec.execution.finishedAt,
          testNotes: spec.execution.testNotes,
          cleanupDone: spec.execution.cleanupDone ?? false,
        },
      });
    }

    for (const item of spec.parts ?? []) {
      const part = partsByCode.get(item.partCode)!;
      await prisma.workOrderPart.create({ data: { workOrderId: wo.id, partId: part.id, quantity: item.quantity } });
      await prisma.part.update({ where: { id: part.id }, data: { stockQty: { decrement: item.quantity } } });
    }

    let fromStatus: WorkOrderStatus | null = null;
    for (const step of spec.history) {
      await prisma.statusHistory.create({
        data: {
          workOrderId: wo.id,
          fromStatus,
          toStatus: step.toStatus,
          changedById: step.changedById,
          note: step.note,
          changedAt: step.changedAt,
        },
      });
      fromStatus = step.toStatus;
    }

    return wo;
  }

  const specs: DemoSpec[] = [];

  // --- ABERTA (2) — recém-abertas, ainda sem triagem ---
  specs.push({
    type: WorkOrderType.PREVENTIVA,
    title: "Manutenção preventiva trimestral",
    description: "Checklist trimestral do sistema de climatização do bloco administrativo.",
    assetCode: "AT-004",
    createdAt: daysAgo(2),
    finalStatus: WorkOrderStatus.ABERTA,
    history: linearHistory(WorkOrderStatus.ABERTA, daysAgo(2), 0),
  });
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Ruído estranho no elevador",
    description: "Operadores relataram ruído incomum durante a subida com carga.",
    assetCode: "AT-009",
    createdAt: daysAgo(1),
    finalStatus: WorkOrderStatus.ABERTA,
    history: linearHistory(WorkOrderStatus.ABERTA, daysAgo(1), 0),
  });

  // --- TRIAGEM (2) ---
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Portão não fecha completamente",
    description: "Portão automático da entrada principal para antes de fechar totalmente.",
    assetCode: "AT-006",
    createdAt: daysAgo(4),
    finalStatus: WorkOrderStatus.TRIAGEM,
    priority: Priority.BAIXA,
    targetSectorId: predial,
    history: linearHistory(WorkOrderStatus.TRIAGEM, daysAgo(4), 3),
  });
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Disjuntor desarmando sozinho",
    description: "Disjuntor do quadro secundário desarma sem carga aparente.",
    assetCode: "AT-008",
    createdAt: daysAgo(3),
    finalStatus: WorkOrderStatus.TRIAGEM,
    priority: Priority.ALTA,
    targetSectorId: eletrica,
    history: linearHistory(WorkOrderStatus.TRIAGEM, daysAgo(3), 2),
  });

  // --- PLANEJADA (2) ---
  specs.push({
    type: WorkOrderType.PREDITIVA,
    title: "Vibração acima do normal detectada",
    description: "Análise preditiva apontou vibração acima do limite no motor da Linha 1.",
    assetCode: "AT-005",
    createdAt: daysAgo(6),
    finalStatus: WorkOrderStatus.PLANEJADA,
    priority: Priority.MEDIA,
    targetSectorId: eletrica,
    plan: "Análise de vibração e balanceamento do rotor.",
    history: linearHistory(WorkOrderStatus.PLANEJADA, daysAgo(6), 6),
  });
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Vazamento de óleo hidráulico",
    description: "Vazamento visível na base da bomba hidráulica da Linha 2.",
    assetCode: "AT-007",
    createdAt: daysAgo(5),
    finalStatus: WorkOrderStatus.PLANEJADA,
    priority: Priority.ALTA,
    targetSectorId: mecanica,
    plan: "Trocar vedação e verificar mangueiras de pressão.",
    history: linearHistory(WorkOrderStatus.PLANEJADA, daysAgo(5), 4),
  });

  // --- PROGRAMADA (2) ---
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Aquecimento excessivo no painel",
    description: "Painel elétrico principal apresentando temperatura acima do normal.",
    assetCode: "AT-002",
    createdAt: daysAgo(8),
    finalStatus: WorkOrderStatus.PROGRAMADA,
    priority: Priority.URGENTE,
    targetSectorId: eletrica,
    plan: "Desenergizar e inspecionar conexões e barramentos.",
    scheduledStart: plus(now, 24),
    scheduledEnd: plus(now, 28),
    assignedToId: tecnico.id,
    history: linearHistory(WorkOrderStatus.PROGRAMADA, daysAgo(8), 8),
  });
  specs.push({
    type: WorkOrderType.PREVENTIVA,
    title: "Limpeza e verificação anual",
    description: "Manutenção preventiva anual da torre de resfriamento.",
    assetCode: "AT-010",
    createdAt: daysAgo(7),
    finalStatus: WorkOrderStatus.PROGRAMADA,
    priority: Priority.BAIXA,
    targetSectorId: mecanica,
    plan: "Limpeza de bandejas, troca de água e inspeção do motor do ventilador.",
    scheduledStart: plus(now, 48),
    scheduledEnd: plus(now, 51),
    assignedToId: tecnico.id,
    history: linearHistory(WorkOrderStatus.PROGRAMADA, daysAgo(7), 8),
  });

  // --- EM_EXECUCAO (2) ---
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Vazamento de ar na linha secundária",
    description: "Vazamento audível na linha secundária do compressor.",
    assetCode: "AT-001",
    createdAt: daysAgo(5),
    finalStatus: WorkOrderStatus.EM_EXECUCAO,
    priority: Priority.ALTA,
    targetSectorId: mecanica,
    plan: "Isolar trecho e trocar conexão da linha.",
    scheduledStart: plus(daysAgo(1), 8),
    scheduledEnd: plus(daysAgo(1), 12),
    assignedToId: tecnico.id,
    execution: { riskAnalysis: "Bloqueio pneumático e uso de EPI antes da intervenção.", startedAt: plus(daysAgo(1), 8.25) },
    history: linearHistory(WorkOrderStatus.EM_EXECUCAO, daysAgo(5), 6),
  });
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Esteira travando intermitentemente",
    description: "Esteira transportadora trava por alguns segundos de forma intermitente.",
    assetCode: "AT-003",
    createdAt: daysAgo(4),
    finalStatus: WorkOrderStatus.EM_EXECUCAO,
    priority: Priority.MEDIA,
    targetSectorId: mecanica,
    plan: "Verificar motor de acionamento e tensão das correias.",
    scheduledStart: plus(daysAgo(0), 7),
    scheduledEnd: plus(daysAgo(0), 11),
    assignedToId: tecnico.id,
    execution: { riskAnalysis: "Bloqueio elétrico do motor de acionamento.", startedAt: plus(daysAgo(0), 7.5) },
    history: linearHistory(WorkOrderStatus.EM_EXECUCAO, daysAgo(4), 5),
  });

  // --- AGUARDANDO_VALIDACAO (2) ---
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Motor superaquecendo",
    description: "Motor de indução da Linha 1 desarmando por temperatura.",
    assetCode: "AT-005",
    createdAt: daysAgo(9),
    finalStatus: WorkOrderStatus.AGUARDANDO_VALIDACAO,
    priority: Priority.ALTA,
    targetSectorId: eletrica,
    plan: "Verificar ventilação e rolamentos do motor.",
    scheduledStart: plus(daysAgo(2), 8),
    scheduledEnd: plus(daysAgo(2), 12),
    assignedToId: tecnico.id,
    execution: {
      riskAnalysis: "Desligar e bloquear o motor antes de intervir.",
      startedAt: plus(daysAgo(2), 8.15),
      rootCause: "Rolamento dianteiro desgastado, gerando atrito excessivo.",
      repairDescription: "Rolamento substituído e lubrificação refeita.",
      finishedAt: plus(daysAgo(2), 11.5),
      testNotes: "Motor testado por 30 minutos sem superaquecimento.",
      cleanupDone: true,
    },
    parts: [{ partCode: "PC-001", quantity: 1 }],
    history: linearHistory(WorkOrderStatus.AGUARDANDO_VALIDACAO, daysAgo(9), 12),
  });
  specs.push({
    type: WorkOrderType.PREDITIVA,
    title: "Análise preditiva indicou desgaste",
    description: "Sensor preditivo indicou desgaste acima do esperado no selo da bomba.",
    assetCode: "AT-007",
    createdAt: daysAgo(7),
    finalStatus: WorkOrderStatus.AGUARDANDO_VALIDACAO,
    priority: Priority.MEDIA,
    targetSectorId: mecanica,
    plan: "Inspeção e troca preventiva do selo mecânico.",
    scheduledStart: plus(daysAgo(1), 9),
    scheduledEnd: plus(daysAgo(1), 12),
    assignedToId: tecnico.id,
    execution: {
      riskAnalysis: "Despressurizar a linha antes da troca do selo.",
      startedAt: plus(daysAgo(1), 9.3),
      rootCause: "Selo mecânico com desgaste acima do previsto para o período.",
      repairDescription: "Selo substituído preventivamente.",
      finishedAt: plus(daysAgo(1), 11.75),
      testNotes: "Sem vazamentos após religamento e teste de pressão.",
      cleanupDone: true,
    },
    parts: [{ partCode: "PC-015", quantity: 1 }],
    history: linearHistory(WorkOrderStatus.AGUARDANDO_VALIDACAO, daysAgo(7), 10),
  });

  // --- ENCERRADA (6) — datas espalhadas para MTBF plausível ---
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Falha na válvula de segurança",
    description: "Válvula de segurança do compressor não aliviava pressão corretamente.",
    assetCode: "AT-001",
    createdAt: daysAgo(75),
    finalStatus: WorkOrderStatus.ENCERRADA,
    priority: Priority.URGENTE,
    targetSectorId: mecanica,
    plan: "Substituir válvula de segurança.",
    scheduledStart: plus(daysAgo(74), 8),
    scheduledEnd: plus(daysAgo(74), 12),
    assignedToId: tecnico.id,
    execution: {
      riskAnalysis: "Despressurizar sistema completamente antes da troca.",
      startedAt: plus(daysAgo(74), 8.2),
      rootCause: "Válvula de segurança travada por corrosão interna.",
      repairDescription: "Válvula substituída por unidade nova.",
      finishedAt: plus(daysAgo(74), 12.2),
      testNotes: "Teste de alívio de pressão aprovado.",
      cleanupDone: true,
    },
    parts: [{ partCode: "PC-003", quantity: 2 }],
    history: linearHistory(WorkOrderStatus.ENCERRADA, daysAgo(75), 6),
  });
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Ruído anormal no compressor",
    description: "Ruído metálico intermitente durante a operação do compressor.",
    assetCode: "AT-001",
    createdAt: daysAgo(45),
    finalStatus: WorkOrderStatus.ENCERRADA,
    priority: Priority.ALTA,
    targetSectorId: mecanica,
    plan: "Inspecionar rolamentos e fixação do motor.",
    scheduledStart: plus(daysAgo(44), 8),
    scheduledEnd: plus(daysAgo(44), 11),
    assignedToId: tecnico.id,
    execution: {
      riskAnalysis: "Bloqueio elétrico antes da inspeção.",
      startedAt: plus(daysAgo(44), 8.1),
      rootCause: "Rolamento do motor com folga excessiva.",
      repairDescription: "Rolamento substituído.",
      finishedAt: plus(daysAgo(44), 11.1),
      testNotes: "Operação normalizada, sem ruído.",
      cleanupDone: true,
    },
    parts: [{ partCode: "PC-001", quantity: 2 }],
    history: linearHistory(WorkOrderStatus.ENCERRADA, daysAgo(45), 5),
  });
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Pressão instável na saída",
    description: "Pressão de saída do compressor oscilando fora da faixa normal.",
    assetCode: "AT-001",
    createdAt: daysAgo(12),
    finalStatus: WorkOrderStatus.ENCERRADA,
    priority: Priority.ALTA,
    targetSectorId: mecanica,
    plan: "Verificar regulador de pressão e filtros.",
    scheduledStart: plus(daysAgo(11), 8),
    scheduledEnd: plus(daysAgo(11), 12),
    assignedToId: tecnico.id,
    execution: {
      riskAnalysis: "Despressurizar antes de abrir o regulador.",
      // Início um dia DEPOIS do agendado (atraso) — dado proposital para
      // variar a métrica de aderência à programação.
      startedAt: plus(daysAgo(10), 9),
      rootCause: "Filtro de entrada obstruído causando instabilidade.",
      repairDescription: "Filtro substituído e regulador recalibrado.",
      finishedAt: plus(daysAgo(10), 14),
      testNotes: "Pressão estável durante 1h de teste.",
      cleanupDone: true,
    },
    parts: [{ partCode: "PC-006", quantity: 1 }],
    history: linearHistory(WorkOrderStatus.ENCERRADA, daysAgo(12), 8),
  });
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Corrente da esteira rompida",
    description: "Rompimento da corrente de acionamento durante operação.",
    assetCode: "AT-003",
    createdAt: daysAgo(60),
    finalStatus: WorkOrderStatus.ENCERRADA,
    priority: Priority.URGENTE,
    targetSectorId: mecanica,
    plan: "Substituir corrente e verificar alinhamento das engrenagens.",
    scheduledStart: plus(daysAgo(59), 8),
    scheduledEnd: plus(daysAgo(59), 14),
    assignedToId: tecnico.id,
    execution: {
      riskAnalysis: "Bloqueio total da esteira antes da intervenção.",
      startedAt: plus(daysAgo(59), 8.3),
      rootCause: "Corrente com fadiga de material além da vida útil esperada.",
      repairDescription: "Corrente substituída e engrenagens realinhadas.",
      finishedAt: plus(daysAgo(59), 14.3),
      testNotes: "Esteira testada em vazio e com carga, sem falhas.",
      cleanupDone: true,
    },
    parts: [{ partCode: "PC-002", quantity: 1 }],
    history: linearHistory(WorkOrderStatus.ENCERRADA, daysAgo(60), 6),
  });
  specs.push({
    type: WorkOrderType.CORRETIVA,
    title: "Sensor de posição com falha",
    description: "Sensor de posição da esteira apresentando leituras inconsistentes.",
    assetCode: "AT-003",
    createdAt: daysAgo(25),
    finalStatus: WorkOrderStatus.ENCERRADA,
    priority: Priority.MEDIA,
    targetSectorId: mecanica,
    plan: "Substituir sensor de posição.",
    scheduledStart: plus(daysAgo(24), 8),
    scheduledEnd: plus(daysAgo(24), 10),
    assignedToId: tecnico.id,
    execution: {
      riskAnalysis: "Desligar esteira antes da troca do sensor.",
      // Início um dia depois do agendado (atraso).
      startedAt: plus(daysAgo(23), 9),
      rootCause: "Sensor de posição danificado por acúmulo de resíduos.",
      repairDescription: "Sensor substituído e protegido com capa adicional.",
      finishedAt: plus(daysAgo(23), 11),
      testNotes: "Leituras de posição consistentes após substituição.",
      cleanupDone: true,
    },
    parts: [{ partCode: "PC-013", quantity: 1 }],
    history: linearHistory(WorkOrderStatus.ENCERRADA, daysAgo(25), 6),
  });
  specs.push({
    type: WorkOrderType.PREVENTIVA,
    title: "Manutenção preventiva semestral do sistema de climatização",
    description: "Checklist semestral completo do sistema de climatização.",
    assetCode: "AT-004",
    createdAt: daysAgo(15),
    finalStatus: WorkOrderStatus.ENCERRADA,
    priority: Priority.BAIXA,
    targetSectorId: predial,
    plan: "Limpeza de filtros, verificação de gás e dreno.",
    scheduledStart: plus(daysAgo(14), 8),
    scheduledEnd: plus(daysAgo(14), 10),
    assignedToId: tecnico.id,
    execution: {
      riskAnalysis: "Nenhum risco elevado — manutenção de rotina.",
      startedAt: plus(daysAgo(14), 8.1),
      rootCause: "N/A — manutenção preventiva de rotina.",
      repairDescription: "Filtros limpos, gás verificado, dreno desobstruído.",
      finishedAt: plus(daysAgo(14), 10.1),
      testNotes: "Sistema operando dentro da faixa normal.",
      cleanupDone: true,
    },
    history: linearHistory(WorkOrderStatus.ENCERRADA, daysAgo(15), 4),
  });

  // --- CANCELADA (2) ---
  {
    const start = daysAgo(20);
    const history = linearHistory(WorkOrderStatus.TRIAGEM, start, 1);
    history.push({
      toStatus: WorkOrderStatus.CANCELADA,
      changedById: supervisor.id,
      changedAt: plus(start, 3),
      note: "Solicitação duplicada — já havia uma OS aberta para o mesmo problema.",
    });
    specs.push({
      type: WorkOrderType.CORRETIVA,
      title: "Solicitação duplicada de manutenção no portão",
      description: "Portão automático da entrada apresentando falha (OS duplicada).",
      assetCode: "AT-006",
      createdAt: start,
      finalStatus: WorkOrderStatus.CANCELADA,
      priority: Priority.BAIXA,
      targetSectorId: predial,
      history,
    });
  }
  {
    const start = daysAgo(30);
    const history = linearHistory(WorkOrderStatus.PROGRAMADA, start, 8);
    history.push({
      toStatus: WorkOrderStatus.CANCELADA,
      changedById: supervisor.id,
      changedAt: plus(start, 30),
      note: "Parada de produção não autorizada para a data programada; será reagendada.",
    });
    specs.push({
      type: WorkOrderType.PREVENTIVA,
      title: "Preventiva agendada cancelada por indisponibilidade de parada",
      description: "Manutenção preventiva do painel principal — parada de produção não aprovada.",
      assetCode: "AT-002",
      createdAt: start,
      finalStatus: WorkOrderStatus.CANCELADA,
      priority: Priority.MEDIA,
      targetSectorId: eletrica,
      plan: "Desenergizar painel e revisar barramentos.",
      scheduledStart: plus(daysAgo(25), 8),
      scheduledEnd: plus(daysAgo(25), 14),
      assignedToId: tecnico.id,
      history,
    });
  }

  for (const spec of specs) {
    const wo = await createDemoWorkOrder(spec);
    console.log(`  ${wo.number} — ${spec.finalStatus} — ${spec.title}`);
  }

  console.log(
    `\nSeed de demonstração concluído: 3 usuários, ${assetDefs.length} ativos, ${partDefs.length} peças, ${specs.length} OS.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
