import { chmodSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

if (process.platform !== "darwin") process.exit(0);

const prebuildsDir = join(process.cwd(), "node_modules", "node-pty", "prebuilds");
if (!existsSync(prebuildsDir)) process.exit(0);

for (const entry of readdirSync(prebuildsDir)) {
  if (!entry.startsWith("darwin-")) continue;

  const helper = join(prebuildsDir, entry, "spawn-helper");
  if (!existsSync(helper)) continue;

  const mode = statSync(helper).mode;
  if ((mode & 0o111) !== 0o111) chmodSync(helper, mode | 0o755);
}
