// PreToolUse hook: stop Claude Code from reading or printing secrets files.
// Exit code 2 blocks the tool call and shows the message to Claude.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const tool = input.tool_input ?? {};
const target = [tool.file_path, tool.path, tool.command].filter(Boolean).join(" ");

// .env files (but not .env.example), Terraform variables and state, private keys.
const secret = /(^|[\s/"'])\.env(?!\.example)(\.[\w-]+)?\b|\.tfvars(?!\.example)|\.tfstate\b|\.pem\b|id_rsa/;

if (secret.test(target)) {
  console.error(
    "Blocked: this touches a secrets file. Use .env.example or terraform.tfvars.example for the shape, " +
      "and ask the human if you need a real value."
  );
  process.exit(2);
}
process.exit(0);
