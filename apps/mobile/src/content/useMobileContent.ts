import { useMemo } from "react";
import { useProfile } from "../app/providers/ProfileProvider";
import { getMobileContent } from "./mobileContent";

export function useMobileContent() {
  const { profile } = useProfile();

  return useMemo(() => getMobileContent(profile.outputLocale), [profile.outputLocale]);
}
