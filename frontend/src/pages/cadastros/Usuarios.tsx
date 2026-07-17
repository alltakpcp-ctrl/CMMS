import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Role } from "../../domain/enums";
import { ROLE_LABELS } from "../../domain/labels";
import * as usersApi from "../../api/users";
import { PublicUser } from "../../types";
import { Table } from "../../components/Table";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { getErrorMessage } from "../../lib/errors";
import { useToast } from "../../components/ToastProvider";

interface CreateFormState {
  name: string;
  email: string;
  password: string;
  role: Role;
}

interface EditFormState {
  name: string;
  role: Role;
}

const emptyCreateForm: CreateFormState = { name: "", email: "", password: "", role: Role.OPERADOR };

export default function Usuarios() {
  const { token, user: currentUser } = useAuth();
  const { showError, showSuccess } = useToast();

  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [submitting, setSubmitting] = useState(false);

  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ name: "", role: Role.OPERADOR });

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

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
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
    setEditForm({ name: user.name, role: user.role });
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !editing) return;
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

  async function toggleActive(user: PublicUser) {
    if (!token) return;
    const nextActive = !user.active;
    if (!confirm(`${nextActive ? "Reativar" : "Desativar"} o usuário ${user.name}?`)) return;
    try {
      await usersApi.updateUser(token, user.id, { active: nextActive });
      showSuccess(nextActive ? "Usuário reativado." : "Usuário desativado.");
      reload();
    } catch (err) {
      showError(getErrorMessage(err));
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
                  <Button
                    variant={u.active ? "danger" : "secondary"}
                    onClick={() => toggleActive(u)}
                    disabled={u.id === currentUser?.id}
                    title={u.id === currentUser?.id ? "Você não pode desativar seu próprio usuário" : undefined}
                  >
                    {u.active ? "Desativar" : "Reativar"}
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
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as Role })}
              required
            >
              {Object.values(Role).map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </Select>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowCreateForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
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
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
              required
            >
              {Object.values(Role).map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </Select>
            <p className="text-xs text-slate-500">
              E-mail e senha não são editáveis por aqui. Use o botão Desativar/Reativar na lista para controlar o acesso.
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
