import { spawnSync } from "node:child_process";
const env = { ...process.env, DATABASE_URL: "file:./e2e.db" };
if (!process.env.npm_execpath) throw new Error("Run via npm run e2e:setup.");
for (const script of ["db:generate", "db:push", "db:seed"]) {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, "run", script],
    { env, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
