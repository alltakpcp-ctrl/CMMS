import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Role } from "../../domain/enums";
import { ROLE_LABELS } from "../../domain/labels";
import * as usersApi from "../../api/users";
import { PublicUser } from "../../types";
import { useSectors } from "../../hooks/useSectors";
import { Table } from "../../components/Table";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { Checkbox } from "../../components/Checkbox";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";

interface CreateFormState {
  name: string;
  email: string;
  password: string;
  role: Role;
  sectorId: string | null;
}

interface EditFormState {
  name: string;
  role: Role;
  active: boolean;
  sectorId: string | null;
  canReceivePartRequests: boolean;
}

const emptyCreateForm: CreateFormState = {
  name: "",
  email: "",
  password: "",
  role: Role.OPERADOR,
  sectorId: null,
};

function validatePasswordRule(value: string): string | null {
  if (value.length < 8) return "Senha deve ter ao menos 8 caracteres.";
  if (!/[A-Z]/.test(value)) return "Senha deve conter ao menos uma letra maiúscula.";
  if (!/[0-9]/.test(value)) return "Senha deve conter ao menos um número.";
  if (!/[^A-Za-z0-9]/.test(value)) return "Senha deve conter ao menos um caractere especial.";
  return null;
}

export default function Usuarios() {
  const { token, user: currentUser } = useAuth();
  const { showError, showSuccess } = useToast();
  const { sectors } = useSectors(token);

  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [submitting, setSubmitting] = useState(false);

  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    name: "",
    role: Role.OPERADOR,
    active: true,
    sectorId: null,
    canReceivePartRequests: false,
  });

  const [passwordTarget, setPasswordTarget] = useState<PublicUser | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordFieldError, setPasswordFieldError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  function reload() {
    if (!token) return;
    setLoading(true);
    usersApi
      .listUsers(token)
      .then(setUsers)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [token]);

  function openCreate() {
    setCreateForm(emptyCreateForm);
    setShowCreateForm(true);
  }

  const createSectorMissing = createForm.role === Role.OPERADOR && !createForm.sectorId;

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || createSectorMissing) return;
    setSubmitting(true);
    try {
      await usersApi.createUser(token, createForm);
      showSuccess("Usuário criado.");
      setShowCreateForm(false);
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(user: PublicUser) {
    setEditing(user);
    setEditForm({
      name: user.name,
      role: user.role,
      active: user.active,
      sectorId: user.sector?.id ?? null,
      canReceivePartRequests: user.canReceivePartRequests,
    });
  }

  const editSectorMissing = editForm.role === Role.OPERADOR && !editForm.sectorId;

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !editing || editSectorMissing) return;
    setSubmitting(true);
    try {
      await usersApi.updateUser(token, editing.id, editForm);
      showSuccess("Usuário atualizado.");
      setEditing(null);
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function openPasswordModal(user: PublicUser) {
    setPasswordTarget(user);
    setPasswordValue("");
    setPasswordFieldError(null);
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !passwordTarget) return;
    const validationError = validatePasswordRule(passwordValue);
    if (validationError) {
      setPasswordFieldError(validationError);
      return;
    }
    setPasswordSubmitting(true);
    try {
      await usersApi.changeUserPassword(token, passwordTarget.id, passwordValue);
      showSuccess("Senha redefinida.");
      setPasswordTarget(null);
      setPasswordValue("");
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setPasswordSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Usuários</h1>
          <p className="text-sm text-slate-500">
            Cadastro de contas do sistema. Usuários nunca são removidos — apenas desativados.
          </p>
        </div>
        <Button onClick={openCreate}>Novo usuário</Button>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando…</p>}

      {!loading && users.length === 0 && <EmptyState title="Nenhum usuário cadastrado" />}

      {!loading && users.length > 0 && (
        <Table
          rows={users}
          rowKey={(u) => u.id}
          columns={[
            { header: "Nome", cell: (u) => u.name },
            { header: "E-mail", cell: (u) => u.email },
            { header: "Perfil", cell: (u) => <Badge>{ROLE_LABELS[u.role]}</Badge> },
            { header: "Ativo", cell: (u) => (u.active ? <Badge color="green">Sim</Badge> : <Badge color="red">Não</Badge>) },
            {
              header: "Ações",
              cell: (u) => (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => openEdit(u)}>
                    Editar
                  </Button>
                  <Button variant="secondary" onClick={() => openPasswordModal(u)}>
                    Redefinir senha
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}

      {showCreateForm && (
        <Modal title="Novo usuário" onClose={() => setShowCreateForm(false)}>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <Input
              label="Nome"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              required
            />
            <Input
              label="E-mail"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              required
            />
            <Input
              label="Senha"
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              minLength={6}
              required
            />
            <Select
              label="Perfil"
              value={createForm.role}
              onChange={(e) => {
                const role = e.target.value as Role;
                setCreateForm({ ...createForm, role, sectorId: role === Role.OPERADOR ? createForm.sectorId : null });
              }}
              required
            >
              {Object.values(Role).map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </Select>

            {createForm.role === Role.OPERADOR && (
              <Select
                label="Setor"
                value={createForm.sectorId ?? ""}
                onChange={(e) => setCreateForm({ ...createForm, sectorId: e.target.value || null })}
                required
              >
                <option value="" disabled>
                  Selecione um setor
                </option>
                {sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>
                    {sector.name}
                  </option>
                ))}
              </Select>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowCreateForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || createSectorMissing}>
                {submitting ? "Salvando…" : "Criar usuário"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title={`Editar ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <Input
              label="Nome"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
            />
            <Select
              label="Perfil"
              value={editForm.role}
              onChange={(e) => {
                const role = e.target.value as Role;
                setEditForm({ ...editForm, role, sectorId: role === Role.OPERADOR ? editForm.sectorId : null });
              }}
              disabled={editing.id === currentUser?.id}
              required
            >
              {Object.values(Role).map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </Select>
            {editing.id === currentUser?.id && (
              <p className="text-xs text-amber-600">Você não pode alterar seu próprio perfil.</p>
            )}

            {editForm.role === Role.OPERADOR && (
              <Select
                label="Setor"
                value={editForm.sectorId ?? ""}
                onChange={(e) => setEditForm({ ...editForm, sectorId: e.target.value || null })}
                required
              >
                <option value="" disabled>
                  Selecione um setor
                </option>
                {sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>
                    {sector.name}
                  </option>
                ))}
              </Select>
            )}

            <Checkbox
              label="Ativo"
              checked={editForm.active}
              onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
              disabled={editing.id === currentUser?.id}
            />
            {editing.id === currentUser?.id && (
              <p className="text-xs text-amber-600">Você não pode desativar seu próprio usuário.</p>
            )}
            <Checkbox
              label="Pode receber pedidos de peças"
              checked={editForm.canReceivePartRequests}
              onChange={(e) => setEditForm({ ...editForm, canReceivePartRequests: e.target.checked })}
            />

            <p className="text-xs text-slate-500">
              E-mail e senha não são editáveis por aqui. Use o botão "Redefinir senha" na lista para trocar a senha.
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || editSectorMissing}>
                {submitting ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {passwordTarget && (
        <Modal title={`Redefinir senha de ${passwordTarget.name}`} onClose={() => setPasswordTarget(null)}>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input
              label="Nova senha"
              type="password"
              value={passwordValue}
              onChange={(e) => {
                setPasswordValue(e.target.value);
                setPasswordFieldError(null);
              }}
              error={passwordFieldError ?? undefined}
              required
            />
            <p className="text-xs text-slate-500">
              Mínimo 8 caracteres, com ao menos 1 letra maiúscula, 1 número e 1 caractere especial.
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPasswordTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={passwordSubmitting}>
                {passwordSubmitting ? "Salvando…" : "Redefinir"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
