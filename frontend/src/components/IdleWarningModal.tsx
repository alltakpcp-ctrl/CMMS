import { Modal } from "./Modal";
import { Button } from "./Button";

interface IdleWarningModalProps {
  secondsLeft: number;
  onStay: () => void;
}

export function IdleWarningModal({ secondsLeft, onStay }: IdleWarningModalProps) {
  return (
    <Modal title="Sessão prestes a expirar" onClose={onStay}>
      <p className="mb-4 text-sm text-slate-600">
        Você será desconectado por inatividade em {secondsLeft} segundo(s).
      </p>
      <Button onClick={onStay}>Continuar conectado</Button>
    </Modal>
  );
}
