import { useState } from "react";
import { analyzeMenu } from "../api/pickformeApi";
import { PickForMeApiError } from "../api/apiClient";
import { useProfile } from "../app/providers/ProfileProvider";
import type { AnalyzeData } from "../types/recommendations";
import type { Situation } from "../types/profile";

const UNSAFE_PROFILE_MESSAGE =
  "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten.";

export function useAnalyzeMenu() {
  const { profile } = useProfile();
  const [result, setResult] = useState<AnalyzeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(menuText: string, situation: Situation) {
    setError("");
    setResult(null);

    if (menuText.trim().length < 20) {
      setError("Bitte zuerst eine Speisekarte einfügen.");
      return;
    }

    setLoading(true);

    try {
      const data = await analyzeMenu({
        menuText,
        situation,
        profile: {
          ...profile,
          appetiteMood: situation
        }
      });

      setResult(data);
    } catch (e) {
      if (
        e instanceof PickForMeApiError &&
        (e.code === "NO_SAFE_RECOMMENDATIONS" || e.message.includes("Profilregeln"))
      ) {
        setError(UNSAFE_PROFILE_MESSAGE);
        return;
      }

      setError("Ich konnte diese Speisekarte nicht sicher auswerten.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setError("");
    setResult(null);
  }

  return {
    result,
    loading,
    error,
    run,
    reset
  };
}

