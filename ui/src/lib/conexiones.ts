// PLA-I75 (Conexiones): what a seat's fifth tab reads (src/runner/conexiones-store.ts ConexionesRead), and the pure
// rules of the tab: the catalog's order (its role's first, then by kind) and a cable's one line. Tested without a
// browser (test/i75-conexiones-ui.test.ts).
export type ConexionPrice = "gratis" | "gratis-limite" | "por-confirmar" | "pago";
export type ConexionGroup = "interfaz" | "navegador" | "codigo" | "errores";

export type CatalogItem = {
  id: string;
  maker: string;
  group: ConexionGroup;
  recommended: boolean;
  price: ConexionPrice;
  version: string;
  keys: { env: string; name: string; optional: boolean }[];
  reads: number;
  readTools: string[];
  writes: string[];
  never: string[];
  unattended: boolean;
  needs: string | null;
  remote: boolean;
  connected: boolean;
  /** Seats of this project (slugs) that have it connected. */
  used_by: string[];
};

export type Cable = {
  server: string;
  version: string;
  custom: { package: string; version: string; args: string[] } | null;
  reviewed: boolean;
  paid: boolean;
  price: ConexionPrice | null;
  keys: { env: string; name: string; optional: boolean; set: boolean }[];
  reads: string[];
  writes: { tool: string; on: boolean }[];
  never: string[];
  change: { from: string; to: string; added: string[]; removed: string[]; nowWrites: string[] } | null;
  usage: { calls: number; failed: number; blocked: number; runs: number; tools: { tool: string; ok: number; failed: number; blocked: number }[] };
  recent: { run: string; at: string; task: string | null; calls: number; blocked: number }[];
  problem: "needs-key" | "not-a-copy" | "needs-review" | null;
};

export type ConexionesRead = {
  agent: string;
  role: string | null;
  catalog: CatalogItem[];
  connections: Cable[];
  requests: { id: string; server: string; reason: string; at: string }[];
  blocked: { run: string; at: string; server: string; tool: string; n: number; task: string | null }[];
  past: { server: string; calls: number; lastAt: string }[];
  llaves: string[];
};

export type SkipWhy = "needs-key" | "not-a-copy" | "needs-review" | "needs-login" | "unknown" | "qa-browser" | "no-command";

/** Expert mode: what the next run of the seat gets (GET .../conexiones/corrida), with no key value. */
export type RunPreview = {
  servers: Record<string, { type?: string; command?: string; args?: string[]; url?: string; env?: Record<string, string>; headers?: Record<string, string> }>;
  allow: Record<string, string[]>;
  deny: string[];
  skipped: { server: string; why: SkipWhy }[];
  keys: string[];
};

export const GROUP_ORDER: readonly ConexionGroup[] = ["interfaz", "navegador", "codigo", "errores"];

/** The catalog as the wide sheet lists it: what its role uses first, then the rest by kind. Connected ones stay in
 *  their place, marked «Conectada» (catalogAction). */
export function catalogSections(catalog: CatalogItem[]): { id: "recomendadas" | ConexionGroup; items: CatalogItem[] }[] {
  const rec = catalog.filter((c) => c.recommended && c.unattended);
  const rest = catalog.filter((c) => !rec.includes(c));
  const out: { id: "recomendadas" | ConexionGroup; items: CatalogItem[] }[] = [];
  if (rec.length) out.push({ id: "recomendadas", items: rec });
  for (const g of GROUP_ORDER) {
    // Within a kind, the ones a run can use first.
    const items = rest.filter((c) => c.group === g).sort((a, b) => Number(b.unattended) - Number(a.unattended));
    if (items.length) out.push({ id: g, items });
  }
  return out;
}

/** Paid or to confirm: the card and the summary say so (the design: nothing paid is connected unsaid). */
export const isPaid = (price: ConexionPrice | null): boolean => price === "pago" || price === "por-confirmar";

/** A cable's tone: amber when the owner has something to do (a version to read, a key, a review), else none. */
export const cableTone = (c: Cable): "amber" | null => (c.problem || c.change ? "amber" : null);

/** Whether a run of this seat gets the cable as it stands. */
export const cableRides = (c: Cable): boolean => !c.problem;

// ---- the board (the top of the tab): the seat on the left, one wire per connection to its plug on the right.

export const BOARD_HEIGHT = 210;
/** At most this many plugs fit the board's height; the rest are in the list below it. */
export const BOARD_SLOTS = 6;
const WIRE_MIN = 1.5;
const WIRE_MAX = 6;

/** A wire's stroke width from its calls in 7 days, against the busiest connection: the minimum for none. */
export const wireWidth = (calls: number, max: number): number => (calls <= 0 || max <= 0 ? WIRE_MIN : Math.round((WIRE_MIN + (Math.min(calls, max) / max) * (WIRE_MAX - WIRE_MIN)) * 10) / 10);

export type Plug =
  | { kind: "plania" }
  | { kind: "cable"; server: string; calls: number; width: number; flows: boolean; amber: boolean }
  | { kind: "ask"; server: string; id: string }
  | { kind: "more"; n: number };

/** The board's plugs, top to bottom: Plania (factory, no number: nothing counts its calls here), the connections, the
 *  open requests (amber, dashed). Requests always show; when more connections exist than slots, the busiest show and
 *  one «+N» plug stands for the rest. */
export function boardPlugs(r: Pick<ConexionesRead, "connections" | "requests">): Plug[] {
  const max = Math.max(0, ...r.connections.map((c) => c.usage.calls));
  const asks: Plug[] = r.requests.map((q) => ({ kind: "ask", server: q.server, id: q.id }));
  const room = Math.max(0, BOARD_SLOTS - 1 - asks.length);
  let cables = r.connections;
  let more = 0;
  if (cables.length > room) {
    const keep = new Set([...cables].sort((a, b) => b.usage.calls - a.usage.calls).slice(0, Math.max(0, room - 1)).map((c) => c.server));
    more = cables.length - keep.size;
    cables = cables.filter((c) => keep.has(c.server));
  }
  return [
    { kind: "plania" },
    ...cables.map((c): Plug => ({ kind: "cable", server: c.server, calls: c.usage.calls, width: wireWidth(c.usage.calls, max), flows: c.usage.calls > 0 && !c.problem, amber: cableTone(c) === "amber" })),
    ...(more ? [{ kind: "more", n: more } as Plug] : []),
    ...asks,
  ];
}

/** The plugs' heights (their centres) on a board of this height, leaving room for the caption at the bottom. */
export function plugTops(n: number, height = BOARD_HEIGHT): number[] {
  const top = 22;
  const bottom = height - 42;
  if (n <= 1) return [Math.round((top + bottom) / 2)];
  const step = (bottom - top) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(top + i * step));
}

/** One wire: from the seat (x0, y0) to its plug (x1, y). */
export const wirePath = (x0: number, y0: number, x1: number, y: number): string => `M${x0},${y0} C${x0 + 90},${y0} ${x1 - 90},${y} ${x1},${y}`;

// ---- the catalog card and the connect sheet

/** What a catalog card offers: already on this seat, cannot run unattended (Figma, Vercel), or a connect button. */
export const catalogAction = (it: Pick<CatalogItem, "connected" | "unattended">): "conectada" | "no-corre-sola" | "conectar" => (it.connected ? "conectada" : !it.unattended ? "no-corre-sola" : "conectar");

export type Sheet = { writes: string[]; keys: Record<string, string>; agents: string[] };

/** The connect sheet as it opens: every write off, each key on its default name (an optional one only when Llaves
 *  knows that name), and this seat chosen. */
export function sheetStart(it: Pick<CatalogItem, "keys">, agent: string, llaves: string[]): Sheet {
  return { writes: [], keys: Object.fromEntries(it.keys.map((k) => [k.env, !k.optional || llaves.includes(k.name) ? k.name : ""])), agents: [agent] };
}

/** The names a key's select offers: its default, then what Llaves knows (no repeats). */
export const keyChoices = (defaultName: string, llaves: string[]): string[] => [...new Set([defaultName, ...llaves])];

/** The summary aside: how many tools, how many writes on of how many, how many seats. */
export function sheetSummary(it: Pick<CatalogItem, "readTools" | "writes">, s: Sheet): { tools: number; writesOn: number; writesTotal: number; agents: number } {
  return { tools: it.readTools.length + it.writes.length, writesOn: s.writes.filter((t) => it.writes.includes(t)).length, writesTotal: it.writes.length, agents: s.agents.length };
}

/** What the sheet sends: keys (an optional one left empty is left out), the writes turned on, the other seats. */
export function sheetBody(it: Pick<CatalogItem, "keys" | "writes">, s: Sheet, self: string): { keys?: Record<string, string>; writes: string[]; agents: string[] } {
  const keys: Record<string, string> = {};
  for (const k of it.keys) {
    const name = (s.keys[k.env] ?? "").trim();
    if (name) keys[k.env] = name;
    else if (!k.optional) keys[k.env] = k.name;
  }
  return { ...(it.keys.length ? { keys } : {}), writes: s.writes.filter((t) => it.writes.includes(t)).sort(), agents: s.agents.filter((a) => a !== self) };
}

/** Expert mode: per server, the tools a run may call and the ones it is refused (deny rules are mcp__<server>__<tool>). */
export function previewTools(p: RunPreview): { server: string; allow: string[]; deny: string[] }[] {
  const servers = [...new Set([...Object.keys(p.servers), ...Object.keys(p.allow)])];
  return servers.map((server) => ({
    server,
    allow: p.allow[server] ?? [],
    deny: p.deny.filter((d) => d.startsWith(`mcp__${server}__`)).map((d) => d.slice(`mcp__${server}__`.length)),
  }));
}
