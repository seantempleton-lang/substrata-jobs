import { spawn } from "node:child_process";
import process from "node:process";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", shell: false });
    child.on("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${args.join(" ")} failed with ${signal || `exit ${code}`}`)));
    child.on("error", reject);
  });
}

async function main() {
  if (process.env.RUN_MIGRATIONS !== "false") {
    if (!process.env.MIGRATION_DATABASE_URL && !process.env.DATABASE_URL) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required when RUN_MIGRATIONS is enabled.");
    console.log("Applying Substrata Jobs database migrations...");
    await run(["scripts/db-migrate.mjs", "up"]);
  }
  console.log("Starting Substrata Jobs API and PWA...");
  await run(["server/index.mjs"]);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
