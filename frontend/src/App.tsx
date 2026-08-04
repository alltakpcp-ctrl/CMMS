import { Navigate, Route, Routes } from "react-router-dom";
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
import Setores from "./pages/cadastros/Setores";
import Usuarios from "./pages/cadastros/Usuarios";
import Estoque from "./pages/estoque/Estoque";
import MontarPedido from "./pages/pedidos/MontarPedido";
import RevisaoPedidos from "./pages/pedidos/RevisaoPedidos";
import Compras from "./pages/pedidos/Compras";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import { RequireFlag } from "./auth/RequireFlag";
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
        <Route
          path="/indicadores"
          element={
            <RequireRole roles={[Role.TECNICO, Role.SUPERVISOR]}>
              <Indicadores />
            </RequireRole>
          }
        />

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
          path="/pedidos/montar"
          element={
            <RequireFlag flag="canReceivePartRequests">
              <MontarPedido />
            </RequireFlag>
          }
        />
        <Route
          path="/pedidos/revisao"
          element={
            <RequireRole roles={[Role.SUPERVISOR]}>
              <RevisaoPedidos />
            </RequireRole>
          }
        />
        <Route
          path="/pedidos/compras"
          element={
            <RequireFlag flag="canPurchase">
              <Compras />
            </RequireFlag>
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
          path="/cadastros/setores"
          element={
            <RequireRole roles={[Role.SUPERVISOR]}>
              <Setores />
            </RequireRole>
          }
        />
        <Route path="/cadastros/pecas" element={<Navigate to="/estoque" replace />} />
        <Route
          path="/estoque"
          element={
            <RequireRole roles={[Role.SUPERVISOR, Role.TECNICO]}>
              <Estoque />
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
