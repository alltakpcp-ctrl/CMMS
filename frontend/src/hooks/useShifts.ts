import { useEffect, useState } from "react";
import { listShifts, Shift } from "../api/shifts";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";

export function useShifts(token: string | null) {
  const { showError } = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    listShifts(token)
      .then(setShifts)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, showError]);

  return { shifts, loading };
}
