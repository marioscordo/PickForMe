export function isAiEnabled() {
  return (
    process.env.GUSTAROAI_AI_ENABLED === "true" ||
    process.env.PICKFORME_AI_ENABLED === "true"
  );
}
