import { useEffect, useState } from "react";
import { api } from "../api/apiClient";

export function useCategories() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.categories().then(setList).catch(console.error).finally(() => setLoading(false));
  }, []);

  return { list, loading };
}
