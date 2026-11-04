// PostToolUse hook: after Claude edits a TypeScript file, typecheck that workspace.
// On failure, exit code 2 sends the compiler errors back to Claude so it fixes them right away.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = input.tool_input?.file_path ?? "";
if (!/\.(ts|tsx)$/.test(file)) process.exit(0);

const workspace = file.includes("apps/web") ? "apps/web" : file.includes("apps/api") ? "apps/api" : null;
if (!workspace) process.exit(0);

try {
  execSync(`npm run typecheck -w ${workspace} --silent`, {
    cwd: process.env.CLAUDE_PROJECT_DIR,
    stdio: "pipe",
  });
} catch (err) {
  console.error(`Typecheck failed in ${workspace} after editing ${file}:\n${err.stdout ?? ""}${err.stderr ?? ""}`);
  process.exit(2);
}
process.exit(0);
