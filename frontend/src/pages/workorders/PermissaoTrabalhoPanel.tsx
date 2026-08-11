import { useState, useRef, useEffect } from "react";
import { WorkOrder, PermissaoTrabalho, PermissaoTrabalhoResposta, PublicUser } from "../../types";
import { PermissaoTrabalhoStatus, Role } from "../../domain/enums";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastProvider";
import { getErrorMessage } from "../../lib/errors";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { SearchableSelect, SearchableSelectOption } from "../../components/SearchableSelect";
import { listUsers } from "../../api/users";
import * as ptApi from "../../api/permissaoTrabalho";

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PREENCHIDA: "Preenchida",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADA: "Aprovada",
  REPROVADA: "Reprovada",
  AGUARDANDO_ASSINATURAS: "Aguardando assinaturas",
  LIBERADA: "Liberada",
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
  const [showReprovarModal, setShowReprovarModal] = useState(false);
  const [motivoReprovacao, setMotivoReprovacao] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [assignableUsers, setAssignableUsers] = useState<PublicUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStatusRef = useRef(pt?.status);

  const isSupervisor = user?.role === Role.SUPERVISOR;
  const isSeguranca = user?.role === Role.SEGURANCA;

  // re-sincroniza o estado local sempre que a prop mudar (onReload traz a PT atualizada
  // do servidor) — sem isso, ações que não fazem setPt local deixariam a UI congelada
  useEffect(() => {
    setPt(workOrder.permissaoTrabalho);
  }, [workOrder.permissaoTrabalho]);

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

  // lista de usuários para solicitar assinatura — só supervisor, só enquanto aguarda assinaturas
  useEffect(() => {
    if (!token || !isSupervisor || pt?.status !== PermissaoTrabalhoStatus.AGUARDANDO_ASSINATURAS) {
      return;
    }
    let cancelled = false;
    setLoadingUsers(true);
    listUsers(token)
      .then((list) => {
        if (!cancelled) setAssignableUsers(list);
      })
      .catch((err) => {
        if (!cancelled) showError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isSupervisor, pt?.status]);

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
        : acao === "liberar" ? "PT liberada sem assinaturas."
        : "PT reprovada — retornada para preenchimento."
      );
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  async function handleLiberar() {
    await doAcao("liberar");
  }

  async function confirmarReprovacao() {
    if (!token || !pt) return;
    const motivo = motivoReprovacao.trim();
    if (!motivo) {
      showError("Informe o motivo da reprovação.");
      return;
    }
    setActing(true);
    try {
      // setPt direto da resposta (como no doAcao) muda pt.status localmente, o que já
      // basta para o useEffect de status disparar o onReload — sem chamada explícita aqui
      const updated = await ptApi.patchStatus(token, pt.id, "reprovar", motivo);
      setPt(updated);
      setShowReprovarModal(false);
      showSuccess("PT reprovada — retornada para preenchimento.");
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  async function handleAssinar(assinaturaId: string) {
    if (!token) return;
    setActing(true);
    try {
      // onReload explícito é necessário no caso comum (status não muda, então o
      // useEffect de status não dispara sozinho). Na última assinatura o backend muda
      // para LIBERADA e o useEffect de status também dispara — duplo reload aceitável
      // nesse caso raro e não recorrente.
      await ptApi.assinar(token, assinaturaId);
      onReload?.();
      showSuccess("Assinatura registrada.");
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  async function handleSolicitar() {
    if (!token || !pt || !selectedUserId) return;
    setActing(true);
    try {
      await ptApi.solicitarAssinatura(token, pt.id, selectedUserId);
      onReload?.();
      setSelectedUserId("");
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  async function handleRemover(assinaturaId: string) {
    if (!token) return;
    setActing(true);
    try {
      await ptApi.removerAssinatura(token, assinaturaId);
      onReload?.();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  const podeAprovar = isSeguranca && pt.status === PermissaoTrabalhoStatus.AGUARDANDO_APROVACAO;
  const mostraReprovacao =
    !!pt.rejectionReason &&
    (pt.status === PermissaoTrabalhoStatus.PREENCHIDA || pt.status === PermissaoTrabalhoStatus.RASCUNHO);
  const mostrarAssinaturas = pt.status === PermissaoTrabalhoStatus.AGUARDANDO_ASSINATURAS;

  const assinaturaUserIds = new Set(pt.assinaturas.map((a) => a.userId));
  const userOptions: SearchableSelectOption[] = assignableUsers
    .filter((u) => !assinaturaUserIds.has(u.id))
    .map((u) => ({ value: u.id, label: u.name }));

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

      {mostraReprovacao && (
        <div className="mb-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2">
          <Badge color="red">Reprovada</Badge>
          <p className="text-xs text-red-700">Motivo da reprovação: {pt.rejectionReason}</p>
        </div>
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
        {podeAprovar && (
          <>
            <Button variant="primary" disabled={acting} onClick={() => doAcao("aprovar")}>
              Aprovar
            </Button>
            <Button variant="danger" disabled={acting} onClick={() => setShowReprovarModal(true)}>
              Reprovar
            </Button>
          </>
        )}
      </div>

      {mostrarAssinaturas && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">Assinaturas</h4>

          {pt.assinaturas.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum assinante na lista.</p>
          ) : (
            <ul className="space-y-1">
              {pt.assinaturas.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded border border-slate-100 p-2"
                >
                  <span className="text-sm text-slate-800">{a.user.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge color={a.signedAt ? "green" : "amber"}>{a.signedAt ? "Assinado" : "Pendente"}</Badge>
                    {a.userId === user?.id && !a.signedAt && (
                      <Button variant="primary" disabled={acting} onClick={() => handleAssinar(a.id)}>
                        Assinar
                      </Button>
                    )}
                    {isSupervisor && !a.signedAt && (
                      <Button variant="danger" disabled={acting} onClick={() => handleRemover(a.id)}>
                        Remover
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {isSupervisor && (
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <SearchableSelect
                  label="Solicitar assinatura de"
                  value={selectedUserId}
                  onChange={setSelectedUserId}
                  options={userOptions}
                  placeholder={loadingUsers ? "Carregando..." : "Selecione um usuário"}
                  disabled={loadingUsers}
                />
              </div>
              <Button variant="secondary" disabled={acting || !selectedUserId} onClick={handleSolicitar}>
                Solicitar assinatura
              </Button>
            </div>
          )}

          {pt.assinaturas.length === 0 && (isSupervisor || isSeguranca) && (
            <div className="mt-3">
              <Button variant="secondary" disabled={acting} onClick={handleLiberar}>
                Liberar sem assinaturas
              </Button>
            </div>
          )}
        </div>
      )}

      {showReprovarModal && (
        <Modal title="Reprovar PT" onClose={() => setShowReprovarModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Motivo da reprovação</label>
              <textarea
                value={motivoReprovacao}
                onChange={(e) => setMotivoReprovacao(e.target.value)}
                rows={4}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={acting} onClick={() => setShowReprovarModal(false)}>
                Cancelar
              </Button>
              <Button variant="danger" disabled={acting} onClick={confirmarReprovacao}>
                Confirmar reprovação
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
