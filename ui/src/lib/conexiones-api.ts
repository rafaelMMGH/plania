// PLA-I75: the calls behind a seat's Conexiones tab (src/api/company-conexiones.ts). Screen cookie only. Every write
// answers with the fresh read. No call sends or receives a key's value.
import { ApiError } from "./api";
import type { ConexionesRead, RunPreview } from "./conexiones";

const base = (slug: string, agent: string) => `/api/company/projects/${encodeURIComponent(slug)}/team/${encodeURIComponent(agent)}`;

async function call<T = ConexionesRead>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, credentials: "same-origin", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    const { error, ...detail } = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
    throw new ApiError(res.status, error ?? `HTTP_${res.status}`, detail);
  }
  return (await res.json()) as T;
}
const one = (slug: string, agent: string, server: string) => `${base(slug, agent)}/conexiones/${encodeURIComponent(server)}`;

export const conexionesApi = {
  read: (slug: string, agent: string) => call("GET", `${base(slug, agent)}/conexiones`),
  /** The connect sheet: keys by name, the writes turned on, and other seats of the project (all or none). */
  connect: (slug: string, agent: string, server: string, sheet: { keys?: Record<string, string>; writes?: string[]; agents?: string[] } = {}) => call("PUT", one(slug, agent, server), sheet),
  /** Expert mode: what the next run of this seat gets, with no key value. */
  preview: (slug: string, agent: string) => call<RunPreview>("GET", `${base(slug, agent)}/conexiones/corrida`),
  setWrite: (slug: string, agent: string, server: string, tool: string, on: boolean) => call("PUT", `${one(slug, agent, server)}/writes/${encodeURIComponent(tool)}`, { on }),
  acceptVersion: (slug: string, agent: string, server: string) => call("POST", `${one(slug, agent, server)}/version`),
  review: (slug: string, agent: string, server: string) => call("POST", `${one(slug, agent, server)}/review`),
  disconnect: (slug: string, agent: string, server: string) => call("DELETE", one(slug, agent, server)),
  addCustom: (slug: string, agent: string, input: { server: string; package: string; version: string; args: string[]; allow?: string[] }) => call("POST", `${base(slug, agent)}/conexiones-propias`, input),
  /** An agent's request: yes with the connect sheet's keys and writes, or no (it waits 30 days to ask again). */
  decide: (slug: string, agent: string, id: string, accept: boolean, sheet: { keys?: Record<string, string>; writes?: string[] } = {}) =>
    call("POST", `${base(slug, agent)}/conexiones-pedidos/${encodeURIComponent(id)}`, { accept, ...sheet }),
};
