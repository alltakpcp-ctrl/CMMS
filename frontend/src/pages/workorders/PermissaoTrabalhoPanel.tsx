import { useState, useRef, useEffect } from "react";
import { WorkOrder, PermissaoTrabalho, PermissaoTrabalhoResposta } from "../../types";
import { PermissaoTrabalhoStatus, Role } from "../../domain/enums";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastProvider";
import { getErrorMessage } from "../../lib/errors";
import * as ptApi from "../../api/permissaoTrabalho";

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PREENCHIDA: "Preenchida",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADA: "Aprovada",
  REPROVADA: "Reprovada",
  ENCERRADA: "Encerrada",
};

const EDITAVEL = ["RASCUNHO", "PREENCHIDA", "REPROVADA"];

interface Props {
  workOrder: WorkOrder;
  onReload?: () => void;
}

export function PermissaoTrabalhoPanel({ workOrder, onReload }: Props) {
  const { token, user } = useAuth();
  const { showError, showSuccess } = useToast();
  const [pt, setPt] = useState<PermissaoTrabalho | null>(workOrder.permissaoTrabalho);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStatusRef = useRef(pt?.status);

  // dispara reload quando a PT cruza um marco (status muda), para a timeline atualizar
  useEffect(() => {
    if (pt && prevStatusRef.current !== pt.status) {
      prevStatusRef.current = pt.status;
      onReload?.();
    }
  }, [pt?.status, onReload]);

  // cleanup do timer no unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!pt) {
    return null;
  }

  const editavel = EDITAVEL.includes(pt.status);

  async function saveResposta(resposta: PermissaoTrabalhoResposta, patch: ptApi.PatchRespostaInput) {
    if (!token || !editavel || !pt) return;
    const statusAntes = pt.status; // captura antes do update
    setSavingId(resposta.id);
    try {
      const updated = await ptApi.patchResposta(token, resposta.id, patch);
      setPt(updated);
      // só agenda checkpoint se JÁ estava preenchida/aguardando ANTES deste save
      // (edição de PT já completa) — evita "Alterada" redundante logo após "Preenchida"
      const jaEstavaCompleta =
        statusAntes === PermissaoTrabalhoStatus.PREENCHIDA ||
        statusAntes === PermissaoTrabalhoStatus.AGUARDANDO_APROVACAO;
      if (jaEstavaCompleta) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          ptApi
            .checkpoint(token, updated.id)
            .then(() => onReload?.())
            .catch(() => {}); // silencioso — checkpoint é best-effort
        }, 3000);
      }
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  async function doAcao(acao: ptApi.PatchStatusAcao) {
    if (!token || !pt) return;
    setActing(true);
    try {
      const updated = await ptApi.patchStatus(token, pt.id, acao);
      setPt(updated);
      showSuccess(
        acao === "submeter" ? "PT submetida para aprovação."
        : acao === "aprovar" ? "PT aprovada."
        : "PT reprovada — retornada para preenchimento."
      );
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  const isTecnico = user?.role === Role.TECNICO;
  const isSupervisor = user?.role === Role.SUPERVISOR;
  const podeSubmeter = isTecnico && pt.status === PermissaoTrabalhoStatus.PREENCHIDA;
  const podeAprovar = isSupervisor && pt.status === PermissaoTrabalhoStatus.AGUARDANDO_APROVACAO;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Permissão de Trabalho — Altura</h3>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          {STATUS_LABEL[pt.status] ?? pt.status}
        </span>
      </div>

      {pt.approvedBy && pt.status === PermissaoTrabalhoStatus.APROVADA && (
        <p className="mb-3 text-xs text-emerald-700">
          Aprovada por {pt.approvedBy.name}
          {pt.emittedAt ? ` em ${new Date(pt.emittedAt).toLocaleString("pt-BR")}` : ""}.
        </p>
      )}

      <ul className="space-y-2">
        {pt.respostas.map((r) => (
          <li key={r.id} className="rounded border border-slate-100 p-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm text-slate-800">
                {r.ordem}. {r.pergunta}
              </span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  disabled={!editavel || savingId === r.id}
                  onClick={() => saveResposta(r, { resposta: "SIM", observacao: r.observacao })}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    r.resposta === "SIM"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  } disabled:opacity-50`}
                >
                  Sim
                </button>
                <button
                  type="button"
                  disabled={!editavel || savingId === r.id}
                  onClick={() => saveResposta(r, { resposta: "NA", observacao: r.observacao })}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    r.resposta === "NA"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  } disabled:opacity-50`}
                >
                  N/A
                </button>
                <button
                  type="button"
                  disabled={!editavel || savingId === r.id}
                  onClick={() => saveResposta(r, { resposta: "NAO", observacao: r.observacao })}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    r.resposta === "NAO"
                      ? "bg-red-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  } disabled:opacity-50`}
                >
                  Não
                </button>
              </div>
            </div>
            <input
              type="text"
              defaultValue={r.observacao ?? ""}
              disabled={!editavel}
              placeholder="Observação (opcional)"
              onBlur={(e) => {
                const val = e.target.value.trim() === "" ? null : e.target.value;
                if (val !== (r.observacao ?? null)) {
                  saveResposta(r, { resposta: r.resposta, observacao: val });
                }
              }}
              className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50"
            />
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-2">
        {podeSubmeter && (
          <button
            type="button"
            disabled={acting}
            onClick={() => doAcao("submeter")}
            className="rounded bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            Submeter para aprovação
          </button>
        )}
        {podeAprovar && (
          <>
            <button
              type="button"
              disabled={acting}
              onClick={() => doAcao("aprovar")}
              className="rounded bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              Aprovar
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => doAcao("reprovar")}
              className="rounded bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              Reprovar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
