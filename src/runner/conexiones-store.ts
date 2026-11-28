// PLA-I75 (Conexiones, pass 1): a seat's connections in the database (agent_connections, connection_requests), what
// its sheet reads, the owner's changes, an agent's request, and what one run gets. The catalog and its rules are in
// src/runner/conexiones.ts. Every change here is the owner's (the screen's session); a run only asks
// (request_connection), and nothing on MCP connects, accepts or turns on a tool.
import { and, asc, desc, eq, gte, isNotNull, ne } from "drizzle-orm";
import { bus } from "../events.js";
import type { Db } from "../db/client.js";
import { agentConnections, agentRuns, agents, connectionRequests, projects, type Agent, type AgentConnection, type ConnectionRequest } from "../db/schema.js";
import { ToolError } from "../mcp/errors.js";
import { appEnvOf, projectOf } from "../maquinas/machines.js";
import {
  CATALOG,
  addTally,
  allowedTools,
  catalogEntry,
  connectionDenyRules,
  customProblem,
  databaseProblem,
  isKeyName,
  isPinned,
  keyNamesOf,
  serverConfig,
  snapshotOf,
  versionChange,
  type CatalogEntry,
  type ConnectionRow,
  type CustomSpec,
  type McpServerConfig,
  type McpTally,
  type ToolsSnapshot,
  type VersionChange,
} from "./conexiones.js";
import { isPlaniaOwn } from "./run-env.js";
import { seatOf } from "./skills.js";

const DAY = 24 * 60 * 60 * 1000;

const DECLINE_HOLD_DAYS = 30;
const seenOf = (c: AgentConnection): ToolsSnapshot | null => (c.toolsSeen as ToolsSnapshot | null) ?? null;
/** The screen refreshes on this; a seat's tools are project settings, not a ticket (no writeTx, like Motor and packs). */
const changed = (project: string) => bus.publish({ type: "project", project });

const rowOf = (c: AgentConnection): ConnectionRow => ({ server: c.server, version: c.version, keys: c.keys ?? {}, writesOn: c.writesOn ?? [], custom: c.custom ?? null, reviewed: c.reviewed });

// ---- the sheet's read

export type CatalogView = {
  id: string;
  maker: string;
  group: CatalogEntry["group"];
  recommended: boolean;
  price: CatalogEntry["price"];
  version: string;
  keys: { env: string; name: string; optional: boolean }[];
  reads: number;
  /** The read tools by name (the connect sheet lists them, always on). */
  readTools: string[];
  writes: string[];
  never: string[];
  unattended: boolean;
  needs: string | null;
  /** Reached at an address (http) rather than started on this machine. */
  remote: boolean;
  connected: boolean;
  /** The seats of this project that have it connected (slugs), this one included. */
  used_by: string[];
};

export type KeyView = { env: string; name: string; optional: boolean; set: boolean };

export type ConnectionView = {
  server: string;
  version: string;
  custom: { package: string; version: string; args: string[] } | null;
  reviewed: boolean;
  paid: boolean;
  price: CatalogEntry["price"] | null;
  keys: KeyView[];
  reads: string[];
  writes: { tool: string; on: boolean }[];
  never: string[];
  change: VersionChange | null;
  // The last 7 days, from the runs' own logs.
  usage: { calls: number; failed: number; blocked: number; runs: number; tools: { tool: string; ok: number; failed: number; blocked: number }[] };
  /** The last runs that called it: when, on which ticket, how many calls (newest first, at most 6). */
  recent: { run: string; at: string; task: string | null; calls: number; blocked: number }[];
  problem: "needs-key" | "not-a-copy" | "needs-review" | null;
};

export type RequestView = { id: string; server: string; reason: string; at: string };
export type BlockView = { run: string; at: string; server: string; tool: string; n: number; task: string | null };

export type ConexionesRead = {
  agent: string;
  role: string | null;
  catalog: CatalogView[];
  connections: ConnectionView[];
  requests: RequestView[];
  blocked: BlockView[];
  /** Servers no longer connected whose calls are still in the last 7 days of runs (disconnecting keeps the history). */
  past: { server: string; calls: number; lastAt: string }[];
  /** Key names Llaves knows for this project (the app's env file), offered when a key is named. */
  llaves: string[];
};

const roleOf = (a: Agent): string | null => a.roleTemplate ?? null;

/** Whether a key has a value where a run would get it: the server's environment, then the project's app env file. */
type KeySource = { has: (name: string) => boolean; value: (name: string) => string | undefined; names: string[] };
function keySource(p: Awaited<ReturnType<typeof projectOf>>, env: NodeJS.ProcessEnv): KeySource {
  let app: Map<string, string> = new Map();
  try {
    app = appEnvOf(p).env.values;
  } catch {
    // no app folder on this machine
  }
  const value = (name: string) => (isPlaniaOwn(name) ? undefined : env[name]?.trim() ? env[name] : app.get(name)?.trim() ? app.get(name) : undefined);
  return { has: (n) => value(n) !== undefined, value, names: [...app.keys()].filter(isKeyName).sort() };
}

type RunMeta = { at: string; task: string | null };
async function usageOf(db: Db, agentId: string, since: Date): Promise<{ tally: Record<string, McpTally>; blocked: BlockView[]; meta: Record<string, RunMeta> }> {
  const runs = await db
    .select({ id: agentRuns.id, at: agentRuns.queuedAt, calls: agentRuns.mcpCalls, task: agentRuns.taskKey })
    .from(agentRuns)
    .where(and(eq(agentRuns.agentId, agentId), gte(agentRuns.queuedAt, since), isNotNull(agentRuns.mcpCalls)))
    .orderBy(desc(agentRuns.queuedAt))
    .limit(500);
  const tally: Record<string, McpTally> = {};
  const blocked: BlockView[] = [];
  const meta: Record<string, RunMeta> = {};
  for (const r of runs) {
    meta[r.id] = { at: r.at.toISOString(), task: r.task };
    for (const [server, tools] of Object.entries(r.calls ?? {})) {
      for (const [tool, n] of Object.entries(tools)) {
        const t = (tally[r.id] ??= {});
        for (let i = 0; i < n.ok; i++) addTally(t, server, tool, "ok");
        for (let i = 0; i < n.failed; i++) addTally(t, server, tool, "failed");
        for (let i = 0; i < n.blocked; i++) addTally(t, server, tool, "blocked");
        if (n.blocked > 0 && blocked.length < 30) blocked.push({ run: r.id, at: r.at.toISOString(), server, tool, n: n.blocked, task: r.task });
      }
    }
  }
  return { tally, blocked, meta };
}

function viewOf(c: AgentConnection, keys: KeySource, perRun: Record<string, McpTally>, meta: Record<string, RunMeta>): ConnectionView {
  const row = rowOf(c);
  const e = c.custom ? null : catalogEntry(c.server);
  const tools = new Map<string, { ok: number; failed: number; blocked: number }>();
  let runs = 0;
  const recent: ConnectionView["recent"] = [];
  for (const [runId, t] of Object.entries(perRun)) {
    const s = t[c.server];
    if (!s) continue;
    runs++;
    const n = Object.values(s).reduce((a, x) => ({ calls: a.calls + x.ok + x.failed + x.blocked, blocked: a.blocked + x.blocked }), { calls: 0, blocked: 0 });
    if (meta[runId]) recent.push({ run: runId, at: meta[runId]!.at, task: meta[runId]!.task, ...n });
    for (const [tool, n] of Object.entries(s)) {
      const was = tools.get(tool) ?? { ok: 0, failed: 0, blocked: 0 };
      tools.set(tool, { ok: was.ok + n.ok, failed: was.failed + n.failed, blocked: was.blocked + n.blocked });
    }
  }
  const list = [...tools].map(([tool, n]) => ({ tool, ...n })).sort((a, b) => b.ok + b.failed + b.blocked - (a.ok + a.failed + a.blocked) || a.tool.localeCompare(b.tool));
  const keyViews: KeyView[] = (e?.keys ?? []).map((k) => {
    const name = row.keys[k.env] ?? k.name;
    return { env: k.env, name, optional: k.optional, set: keys.has(name) };
  });
  let problem: ConnectionView["problem"] = null;
  if (c.custom && !c.reviewed) problem = "needs-review";
  else if (keyViews.some((k) => !k.optional && !k.set)) problem = "needs-key";
  else if (e?.database) {
    const k = keyViews[0];
    if (k && databaseProblem(keys.value(k.name), null)) problem = "not-a-copy";
  }
  return {
    server: c.server,
    version: c.version,
    custom: c.custom ? { package: c.custom.package, version: c.custom.version, args: c.custom.args } : null,
    reviewed: c.reviewed,
    paid: e?.price === "pago" || e?.price === "por-confirmar",
    price: e?.price ?? null,
    keys: keyViews,
    reads: c.custom ? [...(c.custom.allow ?? [])] : [...(e?.reads ?? [])],
    writes: (e?.writes ?? []).map((tool) => ({ tool, on: row.writesOn.includes(tool) })),
    never: [...(e?.never ?? [])],
    change: versionChange(row, c.toolsSeen ?? null),
    usage: { calls: list.reduce((n, t) => n + t.ok + t.failed + t.blocked, 0), failed: list.reduce((n, t) => n + t.failed, 0), blocked: list.reduce((n, t) => n + t.blocked, 0), runs, tools: list },
    recent: recent.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6),
    problem,
  };
}

function pastOf(tally: Record<string, McpTally>, meta: Record<string, RunMeta>, connected: Set<string>): ConexionesRead["past"] {
  const by = new Map<string, { calls: number; lastAt: string }>();
  for (const [runId, t] of Object.entries(tally)) {
    for (const [server, tools] of Object.entries(t)) {
      if (connected.has(server) || server === "plania" || server === "browser") continue;
      const calls = Object.values(tools).reduce((n, x) => n + x.ok + x.failed + x.blocked, 0);
      const at = meta[runId]?.at ?? "";
      const was = by.get(server);
      by.set(server, { calls: (was?.calls ?? 0) + calls, lastAt: was && was.lastAt > at ? was.lastAt : at });
    }
  }
  return [...by].map(([server, v]) => ({ server, ...v })).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export async function conexionesRead(db: Db, project: string, agent: string, env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<ConexionesRead> {
  const a = await seatOf(db, project, agent);
  const p = await projectOf(db, project);
  const keys = keySource(p, env);
  const rows = await db.select().from(agentConnections).where(eq(agentConnections.agentId, a.id)).orderBy(asc(agentConnections.createdAt));
  const { tally, blocked, meta } = await usageOf(db, a.id, new Date(now.getTime() - 7 * DAY));
  const role = roleOf(a);
  const connected = new Set(rows.map((r) => r.server));
  // Who uses each entry in this project, in one query.
  const users = await db
    .select({ server: agentConnections.server, slug: agents.slug })
    .from(agentConnections)
    .innerJoin(agents, eq(agents.id, agentConnections.agentId))
    .where(and(eq(agents.projectId, p.id), ne(agents.status, "retired")))
    .orderBy(asc(agents.slug));
  const usedBy = new Map<string, string[]>();
  for (const u of users) usedBy.set(u.server, [...(usedBy.get(u.server) ?? []), u.slug]);
  const catalog: CatalogView[] = CATALOG.map((e) => ({
    id: e.id,
    maker: e.maker,
    group: e.group,
    recommended: !!role && e.roles.includes(role),
    price: e.price,
    version: e.version,
    keys: e.keys.map((k) => ({ env: k.env, name: k.name, optional: k.optional })),
    reads: e.reads.length,
    readTools: [...e.reads],
    writes: [...e.writes],
    never: [...e.never],
    unattended: e.unattended,
    needs: e.needs ?? null,
    remote: e.transport.kind === "http",
    connected: connected.has(e.id),
    used_by: usedBy.get(e.id) ?? [],
  }));
  const requests = await db
    .select()
    .from(connectionRequests)
    .where(and(eq(connectionRequests.agentId, a.id), eq(connectionRequests.state, "proposed")))
    .orderBy(asc(connectionRequests.createdAt));
  return {
    agent: a.slug,
    role,
    catalog,
    connections: rows.map((r) => viewOf(r, keys, tally, meta)),
    past: pastOf(tally, meta, connected),
    requests: requests.map((r) => ({ id: r.id, server: r.server, reason: r.reason, at: r.createdAt.toISOString() })),
    blocked,
    llaves: keys.names,
  };
}

// ---- the owner's changes

const keysFor = (e: CatalogEntry, given: Record<string, string> | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const k of e.keys) {
    if (k.optional && given?.[k.env] === undefined) continue;
    const name = (given?.[k.env] ?? k.name).trim();
    if (!isKeyName(name)) throw new ToolError("CONNECTION_INVALID", { field: `keys.${k.env}` });
    out[k.env] = name;
  }
  for (const env of Object.keys(given ?? {})) if (!e.keys.some((k) => k.env === env)) throw new ToolError("CONNECTION_INVALID", { field: `keys.${env}` });
  return out;
};

async function connectionOf(db: Db, agentId: string, server: string): Promise<AgentConnection> {
  const [c] = await db.select().from(agentConnections).where(and(eq(agentConnections.agentId, agentId), eq(agentConnections.server, server))).limit(1);
  if (!c) throw new ToolError("CONNECTION_NOT_FOUND", { server });
  return c;
}

/** Connects a catalog entry to a seat at the catalog's pinned version, reading only unless the owner picked write
 *  tools on the connect sheet. Connecting again names its keys (and its writes, when given). */
export async function connect(db: Db, project: string, agent: string, server: string, keys?: Record<string, string>, writes?: string[]): Promise<void> {
  const a = await seatOf(db, project, agent);
  const e = catalogEntry(server);
  if (!e) throw new ToolError("CONNECTION_UNKNOWN", { server, known: CATALOG.map((x) => x.id) });
  if (!e.unattended) throw new ToolError("CONNECTION_NEEDS_LOGIN", { server });
  if (!isPinned(e.version, e.transport.kind === "http")) throw new ToolError("CONNECTION_INVALID", { field: "version" });
  const named = keysFor(e, keys);
  for (const t of writes ?? []) {
    if (e.never.includes(t)) throw new ToolError("CONNECTION_TOOL_NEVER", { server, tool: t });
    if (!e.writes.includes(t)) throw new ToolError("CONNECTION_INVALID", { field: "writes", known: [...e.writes] });
  }
  const writesOn = [...new Set(writes ?? [])].sort();
  await db
    .insert(agentConnections)
    .values({ agentId: a.id, server, version: e.version, keys: named, writesOn, toolsSeen: snapshotOf(e) })
    .onConflictDoUpdate({ target: [agentConnections.agentId, agentConnections.server], set: { keys: named, ...(writes ? { writesOn } : {}), updatedAt: new Date() } });
  // A request for this entry is answered by connecting it.
  await db
    .update(connectionRequests)
    .set({ state: "accepted", decidedAt: new Date() })
    .where(and(eq(connectionRequests.agentId, a.id), eq(connectionRequests.server, server), eq(connectionRequests.state, "proposed")));
  changed(project);
}

/** The connect sheet's «A quién»: the same entry, keys and writes for several seats of the project, all or none. */
export async function connectMany(db: Db, project: string, agents: string[], server: string, keys?: Record<string, string>, writes?: string[]): Promise<void> {
  const list = [...new Set(agents)];
  if (!list.length || list.length > 12) throw new ToolError("CONNECTION_INVALID", { field: "agents" });
  await db.transaction(async (tx) => {
    for (const agent of list) await connect(tx as unknown as Db, project, agent, server, keys, writes);
  });
}

/** One write tool on or off. A tool the entry never allows is refused. */
export async function setWrite(db: Db, project: string, agent: string, server: string, tool: string, on: boolean): Promise<void> {
  const a = await seatOf(db, project, agent);
  const c = await connectionOf(db, a.id, server);
  const e = catalogEntry(c.server);
  if (!e || c.custom) throw new ToolError("CONNECTION_INVALID", { field: "tool" });
  if (e.never.includes(tool)) throw new ToolError("CONNECTION_TOOL_NEVER", { server, tool });
  if (!e.writes.includes(tool)) throw new ToolError("CONNECTION_INVALID", { field: "tool", known: [...e.writes] });
  const next = on ? [...new Set([...c.writesOn, tool])].sort() : c.writesOn.filter((t) => t !== tool);
  await db.update(agentConnections).set({ writesOn: next, updatedAt: new Date() }).where(eq(agentConnections.id, c.id));
  changed(project);
}

/** The owner read what the catalog's new version changes and accepts it; turned-on writes it no longer has go. */
export async function acceptVersion(db: Db, project: string, agent: string, server: string): Promise<void> {
  const a = await seatOf(db, project, agent);
  const c = await connectionOf(db, a.id, server);
  const e = catalogEntry(c.server);
  if (!e || c.custom) throw new ToolError("CONNECTION_INVALID", { field: "server" });
  await db
    .update(agentConnections)
    .set({ version: e.version, toolsSeen: snapshotOf(e), writesOn: c.writesOn.filter((t) => e.writes.includes(t)), updatedAt: new Date() })
    .where(eq(agentConnections.id, c.id));
  changed(project);
}

export async function disconnect(db: Db, project: string, agent: string, server: string): Promise<void> {
  const a = await seatOf(db, project, agent);
  const c = await connectionOf(db, a.id, server);
  // The runs keep their calls (agent_runs.mcp_calls); the sheet lists them under «past» for 7 days.
  await db.delete(agentConnections).where(eq(agentConnections.id, c.id));
  changed(project);
}

/** Expert mode: an npm package of the owner's choosing, pinned, unreviewed: no run gets it until the owner accepts it. */
export async function addCustom(db: Db, project: string, agent: string, server: string, spec: CustomSpec): Promise<void> {
  const a = await seatOf(db, project, agent);
  const clean: CustomSpec = { package: spec.package.trim(), version: spec.version.trim(), args: spec.args.map((x) => x.trim()).filter(Boolean), allow: [...new Set((spec.allow ?? []).map((x) => x.trim()).filter(Boolean))].sort() };
  const bad = customProblem(server, clean);
  if (bad) throw new ToolError("CONNECTION_INVALID", { field: bad });
  const [taken] = await db.select({ id: agentConnections.id }).from(agentConnections).where(and(eq(agentConnections.agentId, a.id), eq(agentConnections.server, server))).limit(1);
  if (taken) throw new ToolError("CONNECTION_EXISTS", { server });
  await db.insert(agentConnections).values({ agentId: a.id, server, version: clean.version, custom: clean, reviewed: false });
  changed(project);
}

export async function reviewCustom(db: Db, project: string, agent: string, server: string): Promise<void> {
  const a = await seatOf(db, project, agent);
  const c = await connectionOf(db, a.id, server);
  if (!c.custom) throw new ToolError("CONNECTION_INVALID", { field: "server" });
  await db.update(agentConnections).set({ reviewed: true, updatedAt: new Date() }).where(eq(agentConnections.id, c.id));
  changed(project);
}

// ---- an agent's request, the owner's answer

/** request_connection: a run of a seat on this project asks for a catalog entry, with its reason. One open per entry. */
export async function requestConnection(db: Db, input: { project: string; server: string; reason: string }, by: Agent | null): Promise<RequestView & { state: string }> {
  const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, input.project)).limit(1);
  if (!p) throw new ToolError("PROJECT_NOT_FOUND", { project: input.project });
  if (!by || by.projectId !== p.id || by.status === "retired") throw new ToolError("CONNECTION_REQUEST_NO_SEAT", { project: input.project });
  const e = catalogEntry(input.server.trim());
  if (!e) throw new ToolError("CONNECTION_UNKNOWN", { server: input.server, known: CATALOG.map((x) => x.id) });
  // A tool that needs an interactive sign-in can never run unattended, so the owner could not say yes.
  if (!e.unattended) throw new ToolError("CONNECTION_NEEDS_LOGIN", { server: e.id });
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 600) throw new ToolError("CONNECTION_INVALID", { field: "reason" });
  const [has] = await db.select({ id: agentConnections.id }).from(agentConnections).where(and(eq(agentConnections.agentId, by.id), eq(agentConnections.server, e.id))).limit(1);
  if (has) throw new ToolError("CONNECTION_EXISTS", { server: e.id });
  // The owner said no to this seat and this entry: the same request waits 30 days.
  const holdFrom = new Date(Date.now() - DECLINE_HOLD_DAYS * DAY);
  const [no] = await db
    .select({ at: connectionRequests.decidedAt })
    .from(connectionRequests)
    .where(and(eq(connectionRequests.agentId, by.id), eq(connectionRequests.server, e.id), eq(connectionRequests.state, "declined"), gte(connectionRequests.decidedAt, holdFrom)))
    .orderBy(desc(connectionRequests.decidedAt))
    .limit(1);
  if (no?.at) throw new ToolError("CONNECTION_REQUEST_DECLINED", { server: e.id, until: new Date(no.at.getTime() + DECLINE_HOLD_DAYS * DAY).toISOString() });
  const [open] = await db
    .select()
    .from(connectionRequests)
    .where(and(eq(connectionRequests.agentId, by.id), eq(connectionRequests.server, e.id), eq(connectionRequests.state, "proposed")))
    .limit(1);
  const r: ConnectionRequest = open ?? (await db.insert(connectionRequests).values({ projectId: p.id, agentId: by.id, server: e.id, reason }).returning())[0]!;
  if (!open) bus.publish({ type: "project", project: input.project });
  return { id: r.id, server: r.server, reason: r.reason, at: r.createdAt.toISOString(), state: r.state };
}

/** The owner's yes (connected, reading only) or no. */
export async function decideRequest(db: Db, project: string, agent: string, id: string, accept: boolean, sheet?: { keys?: Record<string, string>; writes?: string[] }): Promise<{ state: "accepted" | "declined" }> {
  const a = await seatOf(db, project, agent);
  const [r] = await db.select().from(connectionRequests).where(and(eq(connectionRequests.id, id), eq(connectionRequests.agentId, a.id))).limit(1);
  if (!r) throw new ToolError("CONNECTION_REQUEST_NOT_FOUND", { id });
  if (r.state !== "proposed") throw new ToolError("CONNECTION_REQUEST_DECIDED", { state: r.state });
  if (accept) {
    await connect(db, project, agent, r.server, sheet?.keys, sheet?.writes);
    return { state: "accepted" };
  }
  const [claimed] = await db
    .update(connectionRequests)
    .set({ state: "declined", decidedAt: new Date() })
    .where(and(eq(connectionRequests.id, id), eq(connectionRequests.state, "proposed")))
    .returning();
  if (!claimed) throw new ToolError("CONNECTION_REQUEST_DECIDED", { state: "accepted" });
  changed(project);
  return { state: "declined" };
}

// ---- one run

export type RunConnections = {
  servers: Record<string, McpServerConfig>;
  deny: string[];
  /** Per server, the only tools the run may call (the PreToolUse hook reads this). */
  allow: Record<string, string[]>;
  /** Key values for the child env only (never logged, never in a file). */
  env: Record<string, string>;
  skipped: { server: string; why: "needs-key" | "not-a-copy" | "needs-review" | "needs-login" | "unknown" | "qa-browser" }[];
};

/**
 * What one run of this seat gets: each connection's server block (keys as ${NAME}), the deny rules for every write tool
 * not turned on (all of them on a read-only run) and every never tool, and the key values for the child env. A
 * connection with a missing key, a database that is not a throwaway copy, or an unreviewed custom server is left out.
 */
export async function runConnections(
  db: Db,
  agent: Pick<Agent, "id">,
  opts: { project: Awaited<ReturnType<typeof projectOf>>; env: NodeJS.ProcessEnv; readOnly: boolean; planiaDb: string | null; qaBrowser: boolean },
): Promise<RunConnections> {
  const rows = await db.select().from(agentConnections).where(eq(agentConnections.agentId, agent.id)).orderBy(asc(agentConnections.createdAt));
  const out: RunConnections = { servers: {}, deny: [], allow: {}, env: {}, skipped: [] };
  if (!rows.length) return out;
  const keys = keySource(opts.project, opts.env);
  for (const c of rows) {
    const row = rowOf(c);
    const e = c.custom ? null : catalogEntry(c.server);
    if (!c.custom && !e) {
      out.skipped.push({ server: c.server, why: "unknown" });
      continue;
    }
    if (e && !e.unattended) {
      out.skipped.push({ server: c.server, why: "needs-login" });
      continue;
    }
    if (c.custom && !c.reviewed) {
      out.skipped.push({ server: c.server, why: "needs-review" });
      continue;
    }
    // The QA walk-through already carries its own browser.
    if (opts.qaBrowser && c.server === "playwright") {
      out.skipped.push({ server: c.server, why: "qa-browser" });
      continue;
    }
    const names = keyNamesOf(row);
    if (names.required.some((n) => !keys.has(n))) {
      out.skipped.push({ server: c.server, why: "needs-key" });
      continue;
    }
    if (e?.database && databaseProblem(keys.value(names.required[0] ?? ""), opts.planiaDb)) {
      out.skipped.push({ server: c.server, why: "not-a-copy" });
      continue;
    }
    // A read-only run (QA, a question, Preguntar) gets no write tool even when the owner turned one on.
    const config = serverConfig(opts.readOnly ? { ...row, writesOn: [] } : row, keys.has);
    if (!config) {
      out.skipped.push({ server: c.server, why: "unknown" });
      continue;
    }
    out.servers[c.server] = config;
    out.deny.push(...connectionDenyRules(row, opts.readOnly, seenOf(c)));
    out.allow[c.server] = allowedTools(row, opts.readOnly, seenOf(c));
    for (const n of [...names.required, ...names.optional.filter(keys.has)]) out.env[n] = keys.value(n)!;
  }
  return out;
}

// ---- expert mode: what the next run of this seat gets

export type RunPreview = {
  servers: Record<string, McpServerConfig>;
  allow: Record<string, string[]>;
  deny: string[];
  skipped: RunConnections["skipped"];
  /** The key names the run reads; their values never leave the server. */
  keys: string[];
};

/** The same config the runner builds for this seat's next work run (not read-only), without any key value. */
export async function runPreview(db: Db, project: string, agent: string, env: NodeJS.ProcessEnv = process.env): Promise<RunPreview> {
  const a = await seatOf(db, project, agent);
  const p = await projectOf(db, project);
  const r = await runConnections(db, a, { project: p, env, readOnly: false, planiaDb: null, qaBrowser: false });
  return { servers: r.servers, allow: r.allow, deny: r.deny, skipped: r.skipped, keys: Object.keys(r.env).sort() };
}
