// PLA-I75 (Conexiones): a seat's fifth tab without a browser. The catalog's order (its role's first, then by kind,
// connected ones out, login-only ones last in their kind), the tab with an agent's amber request, a cable with its
// usage, its blocked calls, its write switches off, a paid label and a version to accept, and the wide catalog.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as { React?: unknown }).React = React;
const load = async (p: string) => (await import(new URL(`../ui/src/${p}`, import.meta.url).href)) as Record<string, any>;
const lib = await load("lib/conexiones.ts");
const comp = await load("components/corriente/conexiones.tsx");
const h = React.createElement;
type M = Record<string, any>;

const item = (id: string, group: string, over: M = {}): M => ({
  id,
  maker: "Hecho",
  group,
  recommended: false,
  price: "gratis",
  version: "1.0.0",
  keys: [],
  reads: 3,
  readTools: ["a_read", "b_read", "c_read"],
  writes: [],
  never: [],
  unattended: true,
  needs: null,
  remote: false,
  connected: false,
  used_by: [],
  ...over,
});
const catalog = [
  item("shadcn", "interfaz", { recommended: true }),
  item("context7", "interfaz", { keys: [{ env: "CONTEXT7_API_KEY", name: "CONTEXT7_API_KEY", optional: true }] }),
  item("figma", "errores", { recommended: true, unattended: false, price: "pago", version: "remota" }),
  item("vercel", "errores", { unattended: false, version: "remota" }),
  item("sentry", "errores", { price: "por-confirmar" }),
  item("github", "codigo", { connected: true }),
];

test("I75 UI #1: the catalog lists its role's first, then by kind; connected ones stay, marked; login-only ones go last", () => {
  const s = lib.catalogSections(catalog);
  assert.deepEqual(s.map((x: M) => x.id), ["recomendadas", "interfaz", "codigo", "errores"]);
  assert.deepEqual(s[2].items.map((x: M) => x.id), ["github"]);
  assert.deepEqual(s[0].items.map((x: M) => x.id), ["shadcn"]);
  assert.deepEqual(s[3].items.map((x: M) => x.id), ["sentry", "figma", "vercel"]);
  assert.equal(lib.catalogAction(catalog[5]), "conectada");
  assert.equal(lib.catalogAction(catalog[2]), "no-corre-sola");
  assert.equal(lib.catalogAction(catalog[0]), "conectar");
  assert.ok(lib.isPaid("pago") && lib.isPaid("por-confirmar") && !lib.isPaid("gratis-limite"));
});

const cable = (server: string, over: M = {}): M => ({
  server,
  version: "v2.2.0",
  custom: null,
  reviewed: true,
  paid: false,
  price: "gratis",
  keys: [{ env: "GITHUB_PERSONAL_ACCESS_TOKEN", name: "GH_TOKEN", optional: false, set: true }],
  reads: ["get_issue"],
  writes: [
    { tool: "create_issue", on: false },
    { tool: "push_files", on: false },
  ],
  never: ["merge_pull_request"],
  change: null,
  usage: { calls: 7, failed: 1, blocked: 2, runs: 3, tools: [{ tool: "get_issue", ok: 5, failed: 0, blocked: 0 }] },
  recent: [
    { run: "r2", at: "2026-11-25T10:00:00Z", task: "TND-7", calls: 4, blocked: 2 },
    { run: "r1", at: "2026-11-24T10:00:00Z", task: null, calls: 3, blocked: 0 },
  ],
  problem: null,
  ...over,
});
const read = (over: M = {}): M => ({ agent: "taller-t", role: "taller", catalog, connections: [], requests: [], blocked: [], past: [], llaves: ["GH_TOKEN"], ...over });
const render = (el: React.ReactElement, data: M) => {
  const client = new QueryClient();
  client.setQueryData(["conexiones", "tienda", "taller-t"], data);
  return renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, {}, el)));
};
const p = { slug: "tienda", team: [] };
const m = { agent: "taller-t", role: "taller" };

test("I75 UI #2: a new seat has only Plania; QA adds the browser", () => {
  assert.match(render(h(comp.ConexionesTab, { p, m, onCatalog: () => undefined }), read()), /Solo Plania\. Sus corridas no tienen otra herramienta\./);
  assert.match(render(h(comp.ConexionesTab, { p, m, onCatalog: () => undefined }), read({ role: "qa" })), /y el navegador cuando recorre la copia de prueba/);
});

test("I75 UI #3: a cable shows its use, what failed and was blocked, its writes off, what is never on; a request is amber", () => {
  const out = render(
    h(comp.ConexionesTab, { p, m, onCatalog: () => undefined }),
    read({
      connections: [cable("github"), cable("sentry", { version: "0.40.0", price: "por-confirmar", paid: true, writes: [], never: [], keys: [], change: { from: "0.40.0", to: "0.50.0", added: ["get_doc"], removed: [], nowWrites: [] } })],
      requests: [{ id: "r1", server: "context7", reason: "Para la librería de fechas.", at: "2026-11-24T10:00:00Z" }],
      blocked: [{ run: "x", at: "2026-11-24T10:00:00Z", server: "github", tool: "create_issue", n: 2, task: "TND-1" }],
    }),
  );
  assert.match(out, /Pide Context7/);
  assert.match(out, /cor-label amber/);
  assert.match(out, /data-control="pedido-revisar-context7"/);
  assert.match(out, /Ahora no/);
  assert.match(out, /7 llamadas en 3 corridas · 7 días/);
  assert.match(out, /1 falló/);
  assert.match(out, /2 bloqueadas/);
  assert.match(out, /role="switch" aria-checked="false"[^>]*data-control="escribe-github-create_issue"/);
  assert.match(out, /Nunca: merge_pull_request\./);
  assert.match(out, /GH_TOKEN/);
  assert.match(out, /tiene valor/);
  // The paid one says so; the new version waits.
  assert.match(out, /Precio por confirmar/);
  assert.match(out, /Versión nueva: 0\.40\.0 → 0\.50\.0/);
  assert.match(out, /Trae: get_doc\./);
  assert.match(out, /data-control="aceptar-version-sentry"/);
  assert.match(out, /Lo que se le bloqueó/);
  assert.match(out, /data-control="conectar-otra"/);
  // Never a key value: the read carries none, and nothing invents one.
  assert.doesNotMatch(out, /ghp_/);
});

test("I75 UI #4: the wide catalog: its role's first, maker and who uses it, connected ones marked, login-only ones cannot be connected", () => {
  const team = [
    { agent: "taller-t", role: "taller", puesto: null },
    { agent: "qa-t", role: "qa", puesto: null },
  ];
  const cat = catalog.map((c) => (c.id === "github" ? { ...c, maker: "GitHub", used_by: ["qa-t", "taller-t"] } : c));
  const out = render(h(comp.CatalogPanel, { p: { slug: "tienda", team }, m, seat: "Taller", onClose: () => undefined }), read({ catalog: cat }));
  assert.match(out, /Para su puesto/);
  assert.ok(out.indexOf('data-entrada="shadcn"') < out.indexOf('data-entrada="context7"'));
  assert.match(out, /6 en el catálogo/);
  // Connected: shown, marked, no connect button; its users by glyph.
  assert.match(out, /data-entrada="github"/);
  assert.match(out, /De GitHub/);
  assert.match(out, /data-conectada="github"/);
  assert.doesNotMatch(out, /data-control="conectar-github"/);
  assert.match(out, /data-usan="qa-t taller-t"/);
  assert.match(out, /Nadie la usa aún/);
  assert.match(out, /data-control="conectar-shadcn"[^>]*>Conectar a Taller</);
  assert.doesNotMatch(out, /data-control="conectar-figma"/);
  assert.match(out, /No corre sola/);
  assert.match(out, /Pide iniciar sesión/);
  assert.match(out, /cnx-chip rd">De pago/);
  assert.match(out, /cnx-chip am">Precio por confirmar/);
  assert.match(out, /data-control="catalogo-experto"/);
});

test("I75 UI #5: a wire's width follows its calls; the board puts Plania first, the requests last, and makes room", () => {
  assert.equal(lib.wireWidth(0, 10), 1.5);
  assert.equal(lib.wireWidth(10, 10), 6);
  assert.equal(lib.wireWidth(5, 10), 3.8);
  assert.equal(lib.wireWidth(3, 0), 1.5);
  assert.ok(lib.wireWidth(2, 10) < lib.wireWidth(8, 10));
  const plugs = lib.boardPlugs({ connections: [cable("github"), cable("sentry", { usage: { ...cable("x").usage, calls: 0 } }), cable("neon", { problem: "needs-key" })], requests: [{ id: "r1", server: "context7", reason: "x", at: "" }] });
  assert.deepEqual(plugs.map((x: M) => x.kind), ["plania", "cable", "cable", "cable", "ask"]);
  assert.equal(plugs[1].width, 6);
  assert.equal(plugs[2].width, 1.5);
  assert.equal(plugs[1].flows, true);
  assert.equal(plugs[2].flows, false, "no calls, no motion");
  assert.equal(plugs[3].flows, false, "a connection its runs do not get does not move");
  assert.equal(plugs[3].amber, true);
  // Too many for the board: the busiest stay and one plug counts the rest; requests always show.
  const many = Array.from({ length: 8 }, (_, i) => cable(`s${i}`, { usage: { ...cable("x").usage, calls: i } }));
  const full = lib.boardPlugs({ connections: many, requests: [{ id: "r1", server: "context7", reason: "x", at: "" }] });
  assert.equal(full.length, lib.BOARD_SLOTS);
  assert.deepEqual(full.filter((x: M) => x.kind === "cable").map((x: M) => x.server), ["s5", "s6", "s7"]);
  assert.deepEqual(full.find((x: M) => x.kind === "more"), { kind: "more", n: 5 });
  assert.equal(full.at(-1).kind, "ask");
  const tops = lib.plugTops(6);
  assert.equal(tops.length, 6);
  assert.ok(tops[0] >= 13 && tops.at(-1) <= lib.BOARD_HEIGHT - 42 + 1, "plugs stay above the caption");
  assert.ok(tops.every((t: number, i: number) => i === 0 || t - tops[i - 1] >= 26), "plugs do not overlap");
  assert.match(lib.wirePath(54, 97, 200, 22), /^M54,97 C144,97 110,22 200,22$/);
});

test("I75 UI #6: the tab draws the board (Plania fixed, a wire per connection, an amber request), the last runs and the disconnected ones", () => {
  const out = render(
    h(comp.ConexionesTab, { p, m, onCatalog: () => undefined }),
    read({
      connections: [cable("github")],
      requests: [{ id: "r1", server: "context7", reason: "Para la librería de fechas.", at: "2026-11-24T10:00:00Z" }],
      past: [{ server: "sentry", calls: 4, lastAt: "2026-11-23T10:00:00Z" }],
    }),
  );
  assert.match(out, /data-board/);
  assert.match(out, /data-plug="plania"[^>]*>.*Plania.*de fábrica/);
  assert.doesNotMatch(out, /data-control="enchufe-plania"/, "Plania's plug is not a button");
  assert.match(out, /class="cnx-wire " d="M[^"]+" stroke-width="6" data-wire="github"/);
  assert.match(out, /class="cnx-flow "/);
  assert.match(out, /class="cnx-wire ask"/);
  assert.match(out, /data-control="enchufe-github"/);
  assert.match(out, /data-control="enchufe-pedido-context7"[^>]*>.*la pide/);
  assert.match(out, /grosor = llamadas en 7 días/);
  assert.match(out, /2 conexiones/);
  // The last runs: ticket, calls, blocked in red.
  assert.match(out, /data-recientes="github"/);
  assert.match(out, /TND-7/);
  assert.match(out, /4 llamadas · <span class="cnx-bad">2 bloqueadas<\/span>/);
  assert.match(out, /sin ticket/);
  assert.match(out, /Desconectadas: lo que hicieron esta semana/);
  assert.match(out, /Sentry/);
  assert.match(out, /data-control="modo-experto"/);
  // The flow stops for people who asked for less motion.
  const css = (globalThis as any).process.getBuiltinModule("node:fs").readFileSync(new URL("../ui/src/equipo.css", import.meta.url), "utf8") as string;
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.cnx-flow \{ animation: none; \} \}/);
  assert.match(css, /\.cnx-board \{[^}]*height: 210px;/);
});

test("I75 UI #7: the connect sheet: reads on, writes off, never listed; keys by name; seats; what it sends", () => {
  const gh = item("github", "codigo", {
    maker: "GitHub",
    readTools: ["get_issue", "list_issues"],
    writes: ["create_issue", "push_files"],
    never: ["merge_pull_request"],
    keys: [{ env: "GITHUB_PERSONAL_ACCESS_TOKEN", name: "GITHUB_PERSONAL_ACCESS_TOKEN", optional: false }],
    remote: true,
    version: "v2.2.0",
  });
  const c7 = item("context7", "interfaz", { keys: [{ env: "CONTEXT7_API_KEY", name: "CONTEXT7_API_KEY", optional: true }], readTools: ["q"] });
  const start = lib.sheetStart(gh, "taller-t", ["GH_TOKEN"]);
  assert.deepEqual(start, { writes: [], keys: { GITHUB_PERSONAL_ACCESS_TOKEN: "GITHUB_PERSONAL_ACCESS_TOKEN" }, agents: ["taller-t"] });
  assert.deepEqual(lib.sheetStart(c7, "taller-t", []).keys, { CONTEXT7_API_KEY: "" }, "an optional key starts empty unless Llaves knows it");
  assert.deepEqual(lib.sheetStart(c7, "taller-t", ["CONTEXT7_API_KEY"]).keys, { CONTEXT7_API_KEY: "CONTEXT7_API_KEY" });
  assert.deepEqual(lib.keyChoices("GITHUB_PERSONAL_ACCESS_TOKEN", ["GH_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN"]), ["GITHUB_PERSONAL_ACCESS_TOKEN", "GH_TOKEN"]);
  const s = { writes: ["push_files", "not_a_tool"], keys: { GITHUB_PERSONAL_ACCESS_TOKEN: "GH_TOKEN" }, agents: ["taller-t", "qa-t"] };
  assert.deepEqual(lib.sheetSummary(gh, s), { tools: 4, writesOn: 1, writesTotal: 2, agents: 2 });
  assert.deepEqual(lib.sheetBody(gh, s, "taller-t"), { keys: { GITHUB_PERSONAL_ACCESS_TOKEN: "GH_TOKEN" }, writes: ["push_files"], agents: ["qa-t"] });
  assert.deepEqual(lib.sheetBody(c7, { writes: [], keys: { CONTEXT7_API_KEY: "" }, agents: ["taller-t"] }, "taller-t"), { keys: {}, writes: [], agents: [] }, "an empty optional key is left out");
  assert.deepEqual(lib.sheetBody(item("shadcn", "interfaz"), lib.sheetStart(item("shadcn", "interfaz"), "taller-t", []), "taller-t"), { writes: [], agents: [] }, "no keys, no keys field");

  const team = [
    { agent: "taller-t", role: "taller", puesto: null },
    { agent: "qa-t", role: "qa", puesto: null },
  ];
  const out = render(h(comp.ConnectSheet, { p: { slug: "tienda", team }, m, seat: "Taller", server: "github", onBack: () => undefined, onDone: () => undefined }), read({ catalog: [gh], llaves: ["GH_TOKEN"] }));
  assert.match(out, /Conectar GitHub/);
  assert.match(out, /De GitHub/);
  assert.match(out, /role="switch" aria-checked="true" class="cor-switch" disabled=""[^>]*data-lee="get_issue"/);
  assert.match(out, /role="switch" aria-checked="false"[^>]*data-control="hoja-escribe-create_issue"/);
  assert.match(out, /merge_pull_request<\/span><span class="cnx-chip rd">nunca/);
  assert.match(out, /<option value="GITHUB_PERSONAL_ACCESS_TOKEN" selected="">GITHUB_PERSONAL_ACCESS_TOKEN<\/option><option value="GH_TOKEN">GH_TOKEN<\/option>/);
  assert.match(out, /puede leer esta llave\. Usa una de solo lectura/);
  assert.match(out, /data-control="hoja-para-taller-t"/);
  assert.match(out, /aria-pressed="false" data-control="hoja-para-qa-t"/);
  assert.match(out, /en su servicio/);
  assert.match(out, /data-escribe="true">0 de 2/);
  assert.match(out, /Conectar a 1 agente/);
  // From an agent's request: that seat only.
  const ask = render(h(comp.ConnectSheet, { p: { slug: "tienda", team }, m, seat: "Taller", server: "github", request: "r1", onBack: () => undefined, onDone: () => undefined }), read({ catalog: [gh] }));
  assert.doesNotMatch(ask, /hoja-para-qa-t/);
  assert.match(ask, /La pidió Taller/);
});

test("I75 UI #8: expert mode shows what the next run gets: the servers, allowed and blocked tools per server, what is left out and why", () => {
  const pv = {
    servers: { github: { type: "http", url: "https://api.githubcopilot.com/mcp/readonly", headers: { Authorization: "Bearer ${GH_TOKEN}" } } },
    allow: { github: ["get_issue", "list_issues"] },
    deny: ["mcp__github__create_issue", "mcp__github__merge_pull_request"],
    skipped: [{ server: "sentry", why: "needs-key" }],
    keys: ["GH_TOKEN"],
  };
  assert.deepEqual(lib.previewTools(pv), [{ server: "github", allow: ["get_issue", "list_issues"], deny: ["create_issue", "merge_pull_request"] }]);
  const client = new QueryClient();
  client.setQueryData(["conexiones-corrida", "tienda", "taller-t"], pv);
  const out = renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, {}, h(comp.ExpertPanel, { p, m, seat: "Taller", onClose: () => undefined }))));
  assert.match(out, /plania: de fábrica, siempre/);
  assert.match(out, /&quot;mcpServers&quot;/);
  assert.match(out, /github: permitidas/);
  assert.match(out, /mcp__github__get_issue/);
  assert.match(out, /github: bloqueadas/);
  assert.match(out, /class="d">\nmcp__github__merge_pull_request/);
  assert.match(out, /sentry: falta el valor de su llave/);
  assert.match(out, /GH_TOKEN/);
  assert.match(out, /Herramientas que puede usar/);
  assert.match(out, /data-control="propia-allow"/);
  assert.doesNotMatch(out, /ghp_/);
});
