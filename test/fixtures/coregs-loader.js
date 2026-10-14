export async function resolve(specifier, context, nextResolve) {
  if (specifier === "mssql") return { url: new URL("./coregs-driver.js", import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
