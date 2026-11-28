// PLA-I75 (Conexiones, pass 1): the tools each agent may use beyond Plania. A reviewed catalog lives here, in code;
// the owner connects an entry to one seat from its sheet (agent_connections, migration 0079). Every run of that seat
// gets Plania plus its connections in its --mcp-config, --strict-mcp-config stays, so nothing from the machine's own
// Claude setup or a repo's .mcp.json comes in.
//
// The rules the design fixed (the Conexiones idea, pass 1):
// - Always a pinned version: an exact semver in the command, never @latest. A remote server cannot be pinned; its row
//   says so and carries the version it was reviewed at.
// - Reading is on, writing is off: every tool that writes is denied (mcp__<server>__<tool>) until the owner turns that
//   one tool on. Denied tools are not even shown to the run. Some tools are never allowed (merging a PR).
// - Keys go by name only: the config says ${NAME}, the value reaches the child env and nothing else; nothing stores,
//   shows or copies a value.
// - A database connection points at one of Plania's throwaway copies (<db>_prueba, <db>_entrega, <db>_ini_…), never
//   the app's own database and never Plania's.
// - A version change is accepted by the owner after reading which tools it adds, drops or turns into writers.
// - Nothing is written to the project's repo.
// The words the owner reads (what each one is for, its notes) live in ui/src/lib/conexiones-words.ts.

import path from "node:path";
import { isPlaniaOwn } from "./run-env.js";

export type ConexionGroup = "interfaz" | "navegador" | "codigo" | "errores";
export type ConexionPrice = "gratis" | "gratis-limite" | "por-confirmar" | "pago";

/** A key the server reads: the variable it expects (env) and the name Plania suggests for it in Llaves. */
export type ConexionKey = { env: string; name: string; optional: boolean; header?: boolean };

export type ConexionTransport =
  | { kind: "stdio"; command: string; args: string[] }
  // url: read-only address; writeUrl: the address once any write tool is on (null: the same).
  | { kind: "http"; url: string; writeUrl: string | null };

export type CatalogEntry = {
  /** The server's name in the run's config and in deny rules: mcp__<id>__<tool>. */
  id: string;
  /** Who makes and publishes the server (the catalog card says it). */
  maker: string;
  group: ConexionGroup;
  /** Role templates it is recommended for (product-owner, research, artist, taller, qa). */
  roles: readonly string[];
  price: ConexionPrice;
  keys: readonly ConexionKey[];
  /** The exact version to pin, or "remota" for a server only reachable at a fixed address. */
  version: string;
  /** {version} in an argument is replaced by the connection's own pinned version. */
  transport: ConexionTransport;
  reads: readonly string[];
  writes: readonly string[];
  /** Tools no run may use, whatever the owner turns on (the owner merges and ships). */
  never: readonly string[];
  /** False: it needs an interactive sign-in, so an unattended run cannot use it. Listed, not connectable. */
  unattended: boolean;
  /** Only for a project that uses this (shown as a condition, not checked). */
  needs?: "storybook";
  /** It talks to a database: its key must point at a throwaway copy. */
  database?: boolean;
};

const npx = (pkg: string, ...rest: string[]): ConexionTransport => ({ kind: "stdio", command: "npx", args: ["-y", `${pkg}@{version}`, ...rest] });

// Reviewed on 2026-11-22 against each package's registry (the Conexiones idea, pass 1). Bump a version here and
// every connection on the old one shows the change for the owner to accept.
export const CATALOG: readonly CatalogEntry[] = [
  {
    id: "shadcn",
    maker: "shadcn",
    group: "interfaz",
    roles: ["taller", "artist"],
    price: "gratis",
    keys: [],
    version: "4.23.0",
    transport: { kind: "stdio", command: "npx", args: ["-y", "shadcn@{version}", "mcp"] },
    reads: ["get_project_registries", "list_items_in_registries", "search_items_in_registries", "view_items_in_registries", "get_item_examples_from_registries", "get_add_command_for_items", "get_audit_checklist"],
    writes: [],
    never: [],
    unattended: true,
  },
  {
    id: "context7",
    maker: "Upstash",
    group: "interfaz",
    roles: ["taller", "research"],
    price: "gratis-limite",
    keys: [{ env: "CONTEXT7_API_KEY", name: "CONTEXT7_API_KEY", optional: true }],
    version: "4.7.3",
    transport: npx("@upstash/context7-mcp"),
    reads: ["resolve-library-id", "get-library-docs", "query-docs"],
    writes: [],
    never: [],
    unattended: true,
  },
  {
    id: "storybook",
    maker: "Storybook",
    group: "interfaz",
    roles: ["artist", "qa"],
    price: "gratis",
    keys: [],
    version: "10.6.8",
    transport: npx("@storybook/addon-mcp"),
    reads: ["get_ui_building_instructions", "get_story_urls", "list_all_components", "get_component_documentation"],
    writes: [],
    never: [],
    unattended: true,
    needs: "storybook",
  },
  {
    id: "playwright",
    maker: "Microsoft",
    group: "navegador",
    roles: ["qa", "artist"],
    price: "gratis",
    keys: [],
    version: "0.0.86",
    transport: npx("@playwright/mcp", "--headless", "--isolated"),
    reads: [
      "browser_navigate",
      "browser_navigate_back",
      "browser_snapshot",
      "browser_take_screenshot",
      "browser_click",
      "browser_type",
      "browser_fill_form",
      "browser_select_option",
      "browser_hover",
      "browser_press_key",
      "browser_wait_for",
      "browser_resize",
      "browser_tabs",
      "browser_console_messages",
      "browser_network_requests",
      "browser_handle_dialog",
      "browser_close",
    ],
    // Running code in the page or sending a file from the machine is more than walking through it.
    writes: ["browser_evaluate", "browser_run_code", "browser_file_upload"],
    never: [],
    unattended: true,
  },
  {
    id: "chrome-devtools",
    maker: "Google",
    group: "navegador",
    roles: ["taller", "qa"],
    price: "gratis",
    keys: [],
    version: "1.13.0",
    // No CrUX lookups and no usage statistics: nothing about the page goes to Google.
    transport: npx("chrome-devtools-mcp", "--headless", "--isolated", "--no-performance-crux", "--no-usage-statistics"),
    reads: ["list_pages", "select_page", "new_page", "navigate_page", "take_snapshot", "take_screenshot", "list_console_messages", "get_console_message", "list_network_requests", "get_network_request", "performance_start_trace", "performance_stop_trace", "performance_analyze_insight", "click", "fill", "hover", "press_key", "wait_for", "resize_page", "close_page"],
    writes: ["evaluate_script", "upload_file"],
    never: [],
    unattended: true,
  },
  {
    id: "github",
    maker: "GitHub",
    group: "codigo",
    roles: ["product-owner", "taller"],
    price: "gratis",
    keys: [{ env: "GITHUB_PERSONAL_ACCESS_TOKEN", name: "GITHUB_PERSONAL_ACCESS_TOKEN", optional: false, header: true }],
    version: "v2.2.0",
    transport: { kind: "http", url: "https://api.githubcopilot.com/mcp/readonly", writeUrl: "https://api.githubcopilot.com/mcp/" },
    reads: ["get_me", "get_file_contents", "search_code", "search_repositories", "list_issues", "get_issue", "search_issues", "list_pull_requests", "get_pull_request", "get_pull_request_diff", "get_pull_request_files", "list_commits", "get_commit", "list_branches"],
    writes: ["create_issue", "update_issue", "add_issue_comment", "create_pull_request", "update_pull_request", "create_branch", "create_or_update_file", "push_files"],
    // Merging and shipping are the owner's; no agent deletes what it did not make.
    never: ["merge_pull_request", "delete_file", "create_repository", "fork_repository"],
    unattended: true,
  },
  {
    id: "base-prueba",
    maker: "Crystal DBA",
    group: "codigo",
    roles: ["taller", "qa"],
    price: "gratis",
    keys: [{ env: "DATABASE_URI", name: "DATABASE_URI", optional: false }],
    version: "0.3.0",
    // Restricted mode: read-only transactions and a time limit. Its author says it is not proof against everything,
    // so it only ever gets a throwaway copy (databaseProblem).
    transport: { kind: "stdio", command: "uvx", args: ["postgres-mcp=={version}", "--access-mode=restricted"] },
    reads: ["list_schemas", "list_objects", "get_object_details", "explain_query", "execute_sql", "analyze_workload_indexes", "analyze_query_indexes", "analyze_db_health", "get_top_queries"],
    writes: [],
    never: [],
    unattended: true,
    database: true,
  },
  {
    id: "neon",
    maker: "Neon",
    group: "codigo",
    roles: ["taller"],
    price: "por-confirmar",
    keys: [{ env: "NEON_API_KEY", name: "NEON_API_KEY", optional: false, header: true }],
    // The npm package is retired: the remote server only.
    version: "remota",
    transport: { kind: "http", url: "https://mcp.neon.tech/mcp?readonly=true", writeUrl: "https://mcp.neon.tech/mcp" },
    reads: ["list_projects", "describe_project", "describe_branch", "get_database_tables", "describe_table_schema", "get_connection_string", "list_branch_computes", "explain_sql_statement", "list_slow_queries"],
    writes: ["create_branch", "run_sql", "run_sql_transaction", "prepare_database_migration", "complete_database_migration", "reset_from_parent"],
    never: ["delete_project", "delete_branch", "create_project"],
    unattended: true,
  },
  {
    id: "sentry",
    maker: "Sentry",
    group: "errores",
    roles: ["taller", "qa"],
    price: "por-confirmar",
    keys: [{ env: "SENTRY_ACCESS_TOKEN", name: "SENTRY_AUTH_TOKEN", optional: false }],
    version: "0.50.0",
    // Its AI search needs a key of another provider; none is passed, so those tools stay off.
    transport: npx("@sentry/mcp-server"),
    reads: ["whoami", "find_organizations", "find_projects", "find_teams", "find_releases", "get_issue_details", "get_trace_details", "get_event_attachment", "search_docs", "get_doc"],
    writes: ["update_issue", "create_dsn", "update_project"],
    never: ["create_project", "create_team"],
    unattended: true,
  },
  {
    id: "vercel",
    maker: "Vercel",
    group: "errores",
    roles: [],
    price: "gratis",
    keys: [],
    version: "remota",
    transport: { kind: "http", url: "https://mcp.vercel.com", writeUrl: null },
    reads: ["list_projects", "get_project", "list_deployments", "get_deployment", "get_deployment_build_logs"],
    writes: [],
    never: ["deploy_to_vercel"],
    unattended: false,
  },
  {
    id: "figma",
    maker: "Figma",
    group: "errores",
    roles: ["artist", "taller"],
    price: "pago",
    keys: [],
    version: "remota",
    transport: { kind: "http", url: "https://mcp.figma.com/mcp", writeUrl: null },
    reads: ["get_design_context", "get_screenshot", "get_metadata", "get_variable_defs"],
    writes: [],
    never: [],
    unattended: false,
  },
];

export const catalogEntry = (id: string): CatalogEntry | null => CATALOG.find((e) => e.id === id) ?? null;

/** An exact version: x.y.z with an optional pre-release, or a remote server's own label. Never latest, a range or a tag. */
const SEMVER = /^v?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
export const isPinned = (version: string, remote = false): boolean => SEMVER.test(version) || (remote && version === "remota");

/** A server name a run may carry: lower case, digits and dashes; not Plania's own and not the QA browser's. */
export const SERVER_NAME = /^[a-z][a-z0-9-]{1,39}$/;
export const RESERVED_SERVERS = new Set(["plania", "browser", "corrida"]);

/** A custom server (expert mode): an npm package at an exact version, started with npx. Unreviewed until accepted. */
// allow: the tools the owner lets it call, by name (PLA-I75 review): a custom server's tools are not known to Plania, so
// none runs until the owner names it.
export type CustomSpec = { package: string; version: string; args: string[]; allow?: string[] };
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,80}$/;
const NPM_NAME = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
export function customProblem(id: string, spec: CustomSpec): "name" | "package" | "version" | "args" | "allow" | null {
  if (!SERVER_NAME.test(id) || RESERVED_SERVERS.has(id) || catalogEntry(id)) return "name";
  if (!NPM_NAME.test(spec.package) || spec.package.length > 120) return "package";
  if (!isPinned(spec.version)) return "version";
  // No key values, no shell: plain flags only, and nothing that looks like a secret.
  if (spec.args.length > 12 || spec.args.some((a) => a.length > 120 || !/^[A-Za-z0-9@._:/=-]+$/.test(a) || /(token|secret|password|key)=/i.test(a))) return "args";
  if ((spec.allow ?? []).length > 40 || (spec.allow ?? []).some((t) => !TOOL_NAME.test(t))) return "allow";
  return null;
}

/** What one stored connection holds (agent_connections). keys maps the variable the server reads to the key name. */
export type ConnectionRow = {
  server: string;
  version: string;
  keys: Record<string, string>;
  writesOn: string[];
  custom: CustomSpec | null;
  reviewed: boolean;
};

export type McpServerConfig =
  | { type?: "stdio"; command: string; args: string[]; env?: Record<string, string> }
  | { type: "http"; url: string; headers?: Record<string, string> };

const KEY_NAME = /^[A-Z_][A-Z0-9_]{0,79}$/;
// PLA-I75 review: a connection may not name one of Plania's own variables (its database, its tokens, PLANIA_*): their
// values would reach a run's environment past run-env's filter.
export const isKeyName = (name: string): boolean => KEY_NAME.test(name) && !isPlaniaOwn(name);

/** The server block of one connection for a run's --mcp-config. Keys appear only as ${NAME}, in env or a header. */
export function serverConfig(c: ConnectionRow, has: (name: string) => boolean = () => true): McpServerConfig | null {
  if (c.custom) {
    if (!c.reviewed || customProblem(c.server, c.custom)) return null;
    return { command: "npx", args: ["-y", `${c.custom.package}@${c.custom.version}`, ...c.custom.args] };
  }
  const e = catalogEntry(c.server);
  if (!e || !e.unattended) return null;
  const t = e.transport;
  if (t.kind === "stdio") {
    if (!isPinned(c.version)) return null;
    const env: Record<string, string> = {};
    for (const k of e.keys) {
      const name = c.keys[k.env] ?? k.name;
      // An optional key with no value is left out: the server runs without it (PLA-I75 review).
      if (isKeyName(name) && (!k.optional || has(name))) env[k.env] = `\${${name}}`;
    }
    return { command: t.command, args: t.args.map((a) => a.replaceAll("{version}", c.version)), ...(Object.keys(env).length ? { env } : {}) };
  }
  const headers: Record<string, string> = {};
  for (const k of e.keys.filter((k) => k.header)) {
    const name = c.keys[k.env] ?? k.name;
    if (isKeyName(name) && (!k.optional || has(name))) headers.Authorization = `Bearer \${${name}}`;
  }
  const writing = c.writesOn.some((w) => e.writes.includes(w));
  return { type: "http", url: writing && t.writeUrl ? t.writeUrl : t.url, ...(Object.keys(headers).length ? { headers } : {}) };
}

/** The key names a connection reads (the values come from the server's env or Llaves): the ones it needs, and the
 *  optional ones it uses when they have a value. */
export function keyNamesOf(c: ConnectionRow): { required: string[]; optional: string[] } {
  const out = { required: [] as string[], optional: [] as string[] };
  if (c.custom) return out;
  const e = catalogEntry(c.server);
  if (!e) return out;
  for (const k of e.keys) {
    const name = c.keys[k.env] ?? k.name;
    if (isKeyName(name)) (k.optional ? out.optional : out.required).push(name);
  }
  return out;
}

/** The tools of the version this connection runs: what the owner accepted (seen), else the catalog's. A run on an
 *  older version keeps that version's lists until the owner accepts the new one (PLA-I75 review). */
const toolsOf = (c: ConnectionRow, seen: ToolsSnapshot | null): ToolsSnapshot | null => {
  const e = catalogEntry(c.server);
  if (!e) return null;
  return seen && c.version !== e.version ? seen : snapshotOf(e);
};

/** Deny rules for one connection: every write tool not turned on, and every never tool. readOnly: all writes. */
export function connectionDenyRules(c: ConnectionRow, readOnly = false, seen: ToolsSnapshot | null = null): string[] {
  if (c.custom) return [];
  const t = toolsOf(c, seen);
  if (!t) return [];
  const off = t.writes.filter((w) => readOnly || !c.writesOn.includes(w));
  return [...off, ...t.never].map((tool) => `mcp__${c.server}__${tool}`);
}

/**
 * The only tools a run may call on this connection: its reads and the write tools the owner turned on (none on a
 * read-only run); for a custom server, the tools the owner named. Deny rules can only list names Plania knows, so a
 * server that grows a write tool the catalog never listed would get through them; the run's PreToolUse hook
 * (scripts/conexiones-tool-hook.mjs) refuses every call not on this list (PLA-I75 review).
 */
export function allowedTools(c: ConnectionRow, readOnly = false, seen: ToolsSnapshot | null = null): string[] {
  if (c.custom) return readOnly ? [] : [...(c.custom.allow ?? [])].sort();
  const t = toolsOf(c, seen);
  if (!t) return [];
  const on = readOnly ? [] : c.writesOn.filter((w) => t.writes.includes(w));
  return [...new Set([...t.reads, ...on])].sort();
}

/** The run's hook entry: one PreToolUse matcher over this run's connected servers, reading the allow file. */
export const CONNECTION_HOOK_SCRIPT = path.resolve(import.meta.dirname, "../../scripts/conexiones-tool-hook.mjs");
export function connectionHook(servers: string[], allowFile: string): { matcher: string; hooks: { type: "command"; command: string; timeout: number }[] } | null {
  const ids = servers.filter((s) => SERVER_NAME.test(s));
  if (!ids.length) return null;
  return { matcher: `^mcp__(${ids.join("|")})__.*`, hooks: [{ type: "command", command: `node ${JSON.stringify(CONNECTION_HOOK_SCRIPT)} ${JSON.stringify(allowFile)}`, timeout: 15 }] };
}

/** The tools a version shows: what the owner accepted is stored, so a change is read before it is accepted. */
export type ToolsSnapshot = { reads: string[]; writes: string[]; never: string[] };
export const snapshotOf = (e: CatalogEntry): ToolsSnapshot => ({ reads: [...e.reads].sort(), writes: [...e.writes].sort(), never: [...e.never].sort() });

export type VersionChange = { from: string; to: string; added: string[]; removed: string[]; nowWrites: string[] };
/** The catalog moved on from the version this connection was accepted at: what its tools gained, lost or now write. */
export function versionChange(c: ConnectionRow, seen: ToolsSnapshot | null): VersionChange | null {
  if (c.custom) return null;
  const e = catalogEntry(c.server);
  if (!e || e.version === c.version) return null;
  const was = new Set([...(seen?.reads ?? []), ...(seen?.writes ?? [])]);
  const now = [...e.reads, ...e.writes];
  return {
    from: c.version,
    to: e.version,
    added: now.filter((t) => !was.has(t)).sort(),
    removed: [...was].filter((t) => !now.includes(t)).sort(),
    nowWrites: e.writes.filter((t) => (seen?.reads ?? []).includes(t)).sort(),
  };
}

/** A database connection's key must name one of Plania's throwaway copies; null when it does. */
export function databaseProblem(url: string | undefined, planiaDb: string | null): "missing" | "not-a-copy" | "planias" | null {
  if (!url?.trim()) return "missing";
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "not-a-copy";
  }
  if (planiaDb && name === planiaDb) return "planias";
  if (/^plania(_|$)/.test(name)) return "planias";
  return /^[A-Za-z0-9_]+_(entrega|prueba|ini_[a-z0-9_]+)$/.test(name) ? null : "not-a-copy";
}

/** A run's mcp__ call, as the stream showed it: the server, the tool, and whether it ran, failed or was blocked. */
export type McpOutcome = "ok" | "failed" | "blocked";
export type McpTally = Record<string, Record<string, { ok: number; failed: number; blocked: number }>>;

/** mcp__<server>__<tool> split at the first double underscore after the prefix; null for anything else. */
export function splitMcpName(name: string): { server: string; tool: string } | null {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  return m ? { server: m[1]!, tool: m[2]! } : null;
}

export function addTally(t: McpTally, server: string, tool: string, outcome: McpOutcome): void {
  const s = (t[server] ??= {});
  const row = (s[tool] ??= { ok: 0, failed: 0, blocked: 0 });
  row[outcome]++;
}
