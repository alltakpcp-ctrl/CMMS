import { useEffect, useState } from "react";
import { listSectors, Sector } from "../api/sectors";
import { getErrorMessage } from "../lib/errors";
import { useToast } from "../components/ToastProvider";

export function useSectors(token: string | null) {
  const { showError } = useToast();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    listSectors(token)
      .then(setSectors)
      .catch((err) => showError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [token, showError]);

  return { sectors, loading };
}
