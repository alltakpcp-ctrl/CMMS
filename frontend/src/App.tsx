import { Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NovaSolicitacao from "./pages/NovaSolicitacao";
import ListaOS from "./pages/ListaOS";
import Indicadores from "./pages/Indicadores";
import DetalheOS from "./pages/workorders/DetalheOS";
import FilaTriagem from "./pages/FilaTriagem";
import Agenda from "./pages/Agenda";
import MinhasOS from "./pages/MinhasOS";
import Ativos from "./pages/cadastros/Ativos";
import Pecas from "./pages/cadastros/Pecas";
import Usuarios from "./pages/cadastros/Usuarios";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import { AppLayout } from "./layout/AppLayout";
import { Role } from "./domain/enums";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/solicitacoes/nova" element={<NovaSolicitacao />} />
        <Route path="/ordens" element={<ListaOS />} />
        <Route path="/ordens/:id" element={<DetalheOS />} />
        <Route path="/indicadores" element={<Indicadores />} />

        <Route
          path="/fila"
          element={
            <RequireRole roles={[Role.TECNICO, Role.SUPERVISOR]}>
              <FilaTriagem />
            </RequireRole>
          }
        />
        <Route
          path="/agenda"
          element={
            <RequireRole roles={[Role.SUPERVISOR]}>
              <Agenda />
            </RequireRole>
          }
        />
        <Route
          path="/minhas-os"
          element={
            <RequireRole roles={[Role.TECNICO]}>
              <MinhasOS />
            </RequireRole>
          }
        />
        <Route
          path="/cadastros/ativos"
          element={
            <RequireRole roles={[Role.SUPERVISOR]}>
              <Ativos />
            </RequireRole>
          }
        />
        <Route
          path="/cadastros/pecas"
          element={
            <RequireRole roles={[Role.SUPERVISOR]}>
              <Pecas />
            </RequireRole>
          }
        />
        <Route
          path="/cadastros/usuarios"
          element={
            <RequireRole roles={[Role.SUPERVISOR]}>
              <Usuarios />
            </RequireRole>
          }
        />
      </Route>
    </Routes>
  );
}
