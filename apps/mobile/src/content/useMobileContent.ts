import { useMemo } from "react";
import { getMobileContent } from "./mobileContent";
import { resolveGuiLanguageFromDevice } from "./guiLanguage";

export function useMobileContent() {
  return useMemo(() => getMobileContent(resolveGuiLanguageFromDevice()), []);
}
