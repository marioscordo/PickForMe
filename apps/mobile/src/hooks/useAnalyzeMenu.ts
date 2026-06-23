import { useState } from "react";
import { analyzeMenu } from "../api/pickformeApi";
import { useProfile } from "../app/providers/ProfileProvider";
import type { AnalyzeData } from "../types/recommendations";
import type { Situation } from "../types/profile";

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
        profile
      });

      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return {
    result,
    loading,
    error,
    run
  };
}
