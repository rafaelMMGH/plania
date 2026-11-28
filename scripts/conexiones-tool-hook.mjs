#!/usr/bin/env node
// PLA-I75 (Conexiones): the allowlist behind a run's connected tools. Claude Code calls this before every tool call
// whose name matches a connected server (PreToolUse, matcher ^mcp__(<servers>)__). The run's file lists, per server,
// the only tools it may call: its reads and the write tools the owner turned on. Anything else is refused (exit 2),
// even a tool the catalog never listed, so a server that grows a new write tool cannot reach it.
// Usage: node conexiones-tool-hook.mjs <allow.json>     stdin: the hook's JSON ({tool_name, ...})
import { readFileSync } from "node:fs";

const refuse = (why) => {
  process.stderr.write(`Plania: ${why}\n`);
  process.exit(2);
};

let allow;
try {
  allow = JSON.parse(readFileSync(process.argv[2], "utf8")).servers ?? {};
} catch {
  refuse("this run's connection list could not be read, so no connected tool may run.");
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let name = "";
  try {
    name = String(JSON.parse(input).tool_name ?? "");
  } catch {
    refuse("the tool call could not be read.");
  }
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  if (!m) process.exit(0); // not a connected tool: the hook has nothing to say
  const [, server, tool] = m;
  if (server === "plania") process.exit(0);
  const list = allow[server];
  if (!Array.isArray(list)) process.exit(0); // not one of this run's connections (matcher keeps this rare)
  if (list.includes(tool)) process.exit(0);
  refuse(`${tool} is not allowed on the ${server} connection for this run. The owner turns tools on in Equipo › Conexiones; ask for it in your report if you need it.`);
});
