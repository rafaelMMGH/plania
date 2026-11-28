// PLA-I75 (Conexiones): a seat's fifth tab. At its top, the board: the seat on the left, one wire per connection to
// its plug on the right (its width is the calls of 7 days; Plania's plug is fixed; an agent's request is an amber
// dashed wire). Under it the requests, each connection's card (what it did, its last runs, its write switches) and
// what disconnected ones did this week. «Conectar otra» widens the sheet to the reviewed catalog; a card's «Conectar»
// (or a request's «Revisar») opens the connect sheet: what it may do, its key, for whom. «Modo experto» shows what the
// next run gets and takes one of the owner's own. Keys are names only.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, type OrgMember, type OrgProject } from "@/lib/api";
import { words } from "@/lib/i18n";
import { seatName } from "@/lib/corriente";
import { CONEXIONES_WORDS } from "@/lib/conexiones-words";
import {
  BOARD_HEIGHT,
  boardPlugs,
  cableTone,
  catalogAction,
  catalogSections,
  isPaid,
  keyChoices,
  plugTops,
  previewTools,
  sheetBody,
  sheetStart,
  sheetSummary,
  wirePath,
  type Cable,
  type CatalogItem,
  type ConexionesRead,
  type Sheet,
} from "@/lib/conexiones";
import { conexionesApi } from "@/lib/conexiones-api";
import { Btn, Label, ReadError, State, Switch } from "./parts";

const W = () => words(CONEXIONES_WORDS);
const nameOf = (id: string) => W().entries[id]?.name ?? id;
const markOf = (name: string) => name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2);
const codeOf = (e: unknown) => (e instanceof ApiError ? e.code : "NETWORK");
/** A failed write in words: the code's phrase when there is one, and the code itself. */
const failed = (e: unknown) => {
  const w = W();
  const code = codeOf(e);
  return w.errors[code] ? `${w.errors[code]} (${code}).` : w.failedSave(code);
};
const seatOf = (m: Pick<OrgMember, "puesto" | "role">) => m.puesto ?? seatName(m.role);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

const useConexiones = (slug: string, agent: string) => useQuery({ queryKey: ["conexiones", slug, agent], queryFn: () => conexionesApi.read(slug, agent), refetchInterval: 30_000 });

/** One write for the tab: the answer is the fresh read, put straight in the cache; expert mode and the chart refresh. */
function useChange(slug: string, agent: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (run: () => Promise<ConexionesRead>) => run(),
    onSuccess: (read) => {
      client.setQueryData(["conexiones", slug, agent], read);
      void client.invalidateQueries({ queryKey: ["conexiones-corrida", slug, agent] });
      void client.invalidateQueries({ queryKey: ["company-project", slug] });
    },
  });
}

const Failed = ({ error }: { error: unknown }) => (
  <p className="cor-cap">
    <span className="cor-state bad">{failed(error)}</span>
  </p>
);

const Loading = () => (
  <p className="cor-text cor-muted" role="status" aria-busy="true">
    {W().loading}
  </p>
);

// ---- the board

const X0 = 54;
const PLUG_ROOM = 150;

const Board = ({ r, seat, sel, onPlug, onAsk }: { r: ConexionesRead; seat: string; sel: string | null; onPlug: (server: string) => void; onAsk: (server: string, id: string) => void }) => {
  const w = W();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(346);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e?.contentRect.width ?? 0) || 346));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const plugs = boardPlugs(r);
  const tops = plugTops(plugs.length);
  const y0 = BOARD_HEIGHT / 2 - 8;
  const x1 = Math.max(X0 + 60, width - PLUG_ROOM);
  return (
    <div ref={ref} className="cnx-board" role="group" aria-label={w.boardOf(seat)} data-board>
      <svg viewBox={`0 0 ${width} ${BOARD_HEIGHT}`} aria-hidden>
        {plugs.map((pl, i) => {
          if (pl.kind === "more") return null;
          const d = wirePath(X0, y0, x1, tops[i]!);
          const key = pl.kind === "plania" ? "plania" : `${pl.kind}-${pl.server}`;
          const cls = pl.kind === "plania" ? "fixed" : pl.kind === "ask" ? "ask" : pl.amber ? "amber" : "";
          const sw = pl.kind === "cable" ? pl.width : 1.5;
          return (
            <g key={key}>
              <path className={`cnx-wire ${cls}`} d={d} strokeWidth={sw} data-wire={pl.kind === "plania" ? "plania" : pl.server} />
              {pl.kind === "cable" && pl.flows && <path className={`cnx-flow ${pl.width < 3 ? "slow" : ""}`} d={d} strokeWidth={Math.max(1.5, sw - 1)} />}
            </g>
          );
        })}
      </svg>
      <span className="cnx-me" aria-hidden>
        <span className="org-glyph">{seat.slice(0, 2)}</span>
        <span>{seat}</span>
      </span>
      {plugs.map((pl, i) => {
        const style = { top: tops[i] };
        if (pl.kind === "plania")
          return (
            <span key="plania" className="cnx-plug fixed" style={style} title={w.planiaTitle} data-plug="plania">
              <span className="cnx-mark">Pl</span>
              <b>{w.planiaName}</b>
              <small>{w.planiaFactory}</small>
            </span>
          );
        if (pl.kind === "more")
          return (
            <span key="more" className="cnx-plug fixed" style={style} data-plug="mas">
              <small>{w.plugMore(pl.n)}</small>
            </span>
          );
        if (pl.kind === "ask")
          return (
            <button key={`ask-${pl.id}`} type="button" className="cnx-plug ask" style={style} onClick={() => onAsk(pl.server, pl.id)} data-plug={pl.server} data-control={`enchufe-pedido-${pl.server}`}>
              <span className="cnx-mark">{markOf(nameOf(pl.server))}</span>
              <b>{nameOf(pl.server)}</b>
              <small>{w.plugAsks}</small>
            </button>
          );
        return (
          <button key={pl.server} type="button" className={`cnx-plug ${pl.amber ? "amber" : ""} ${sel === pl.server ? "sel" : ""}`} style={style} title={w.plugTitle(nameOf(pl.server), pl.calls)} onClick={() => onPlug(pl.server)} data-plug={pl.server} data-control={`enchufe-${pl.server}`}>
            <span className="cnx-mark">{markOf(nameOf(pl.server))}</span>
            <b>{nameOf(pl.server)}</b>
            <small>{pl.calls}</small>
          </button>
        );
      })}
      <span className="cnx-board-cap">
        <span>{w.boardCaption}</span>
        <span>{w.boardCount(r.connections.length + 1)}</span>
      </span>
    </div>
  );
};

// ---- the tab

export const ConexionesTab = ({
  p,
  m,
  onCatalog,
  onReview = () => undefined,
  onExpert = () => undefined,
}: {
  p: OrgProject;
  m: OrgMember;
  onCatalog: () => void;
  onReview?: (server: string, request: string) => void;
  onExpert?: () => void;
}) => {
  const w = W();
  const q = useConexiones(p.slug, m.agent);
  const change = useChange(p.slug, m.agent);
  const [sel, setSel] = useState<string | null>(null);
  const [declined, setDeclined] = useState<string[]>([]);
  if (q.isError) return <ReadError what={w.readError} onRetry={() => void q.refetch()} />;
  const r = q.data;
  if (!r) return <Loading />;
  const seat = seatOf(m);
  const open = (server: string) => {
    setSel(server);
    const el = typeof document !== "undefined" ? document.getElementById(`cnx-cable-${server}`) : null;
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  };
  return (
    <div className="cnx" data-conexiones>
      <Board r={r} seat={seat} sel={sel} onPlug={open} onAsk={onReview} />
      {r.requests.map((req) => (
        <section key={req.id} className="cnx-request" aria-label={w.requestHead(nameOf(req.server))} data-pedido={req.id}>
          <Label as="h3" tone="amber">
            {w.requestHead(nameOf(req.server))}
          </Label>
          <p className="cor-text">
            <b>{nameOf(req.server)}</b>
            {w.reasonQuoted(req.reason)}
          </p>
          <div className="cnx-row">
            <Btn kind="secondary" small disabled={change.isPending} onClick={() => onReview(req.server, req.id)} data-control={`pedido-revisar-${req.server}`}>
              {w.reviewAsk}
            </Btn>
            <Btn
              kind="quiet"
              small
              disabled={change.isPending}
              onClick={() => change.mutate(() => conexionesApi.decide(p.slug, m.agent, req.id, false), { onSuccess: () => setDeclined((d) => [...d, req.server]) })}
              data-control={`pedido-no-${req.server}`}
            >
              {w.notNow}
            </Btn>
          </div>
        </section>
      ))}
      {declined.map((s) => (
        <p key={s} className="cor-cap" role="status" data-rechazada={s}>
          {w.declined(nameOf(s))}
        </p>
      ))}
      {r.connections.length === 0 ? (
        <p className="cor-text cor-muted">{r.role === "qa" ? w.onlyPlaniaQa : w.onlyPlania}</p>
      ) : (
        r.connections.map((c) => <CableCard key={c.server} slug={p.slug} agent={m.agent} c={c} sel={sel === c.server} />)
      )}
      {r.past.length > 0 && (
        <section className="cnx-blocked" aria-label={w.pastHead} data-pasadas>
          <Label as="h3">{w.pastHead}</Label>
          <ul className="cnx-tools">
            {r.past.map((x) => (
              <li key={x.server}>
                <span>{nameOf(x.server)}</span>
                <span className="cor-cap cor-mono">
                  {w.pastLine(x.calls)}
                  {x.lastAt ? ` · ${day(x.lastAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {r.blocked.length > 0 && (
        <section className="cnx-blocked" aria-label={w.blockedHead}>
          <Label as="h3">{w.blockedHead}</Label>
          <ul className="cnx-tools">
            {r.blocked.slice(0, 8).map((b) => (
              <li key={`${b.run}-${b.server}-${b.tool}`}>
                <span className="cor-mono">{w.blockedLine(`${nameOf(b.server)} · ${b.tool}`, b.n)}</span>
                <span className="cor-cap">{day(b.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {change.isError && <Failed error={change.error} />}
      <div className="cnx-actions">
        <Btn kind="secondary" onClick={onCatalog} data-control="conectar-otra">
          {w.connectOther}
        </Btn>
        <Btn kind="quiet" onClick={onExpert} data-control="modo-experto">
          {w.expertOpen}
        </Btn>
      </div>
    </div>
  );
};

const CableCard = ({ slug, agent, c, sel }: { slug: string; agent: string; c: Cable; sel: boolean }) => {
  const w = W();
  const change = useChange(slug, agent);
  const busy = change.isPending;
  const e = w.entries[c.server];
  return (
    <section id={`cnx-cable-${c.server}`} tabIndex={-1} className={`cor-card cnx-cable ${cableTone(c) ?? ""} ${sel ? "sel" : ""}`} aria-label={nameOf(c.server)} data-cable={c.server}>
      <div className="cnx-head">
        <span className="cnx-mark">{markOf(nameOf(c.server))}</span>
        <b>{nameOf(c.server)}</b>
        <span className="cor-cap cor-mono">{c.custom ? `${c.custom.package}@${c.custom.version}` : w.version(c.version)}</span>
        {isPaid(c.price) && <State tone="amber">{c.price === "pago" ? w.paid : w.price[c.price!]}</State>}
        {c.custom && !c.reviewed && <State tone="amber">{w.unreviewed}</State>}
      </div>
      {e && <p className="cor-cap">{e.para}</p>}
      {c.problem && <p className="cor-cap cnx-warn">{w.problem[c.problem]}</p>}
      {c.change && (
        <div className="cnx-change" data-version-change>
          <p className="cor-cap cnx-warn">{w.change(c.change.from, c.change.to)}</p>
          <p className="cor-cap">
            {c.change.added.length || c.change.removed.length || c.change.nowWrites.length
              ? [c.change.added.length ? w.added(c.change.added.join(", ")) : "", c.change.removed.length ? w.removed(c.change.removed.join(", ")) : "", c.change.nowWrites.length ? w.nowWrites(c.change.nowWrites.join(", ")) : ""].filter(Boolean).join(" ")
              : w.noToolChange}
          </p>
          <Btn kind="secondary" small disabled={busy} onClick={() => change.mutate(() => conexionesApi.acceptVersion(slug, agent, c.server))} data-control={`aceptar-version-${c.server}`}>
            {w.acceptVersion}
          </Btn>
        </div>
      )}
      {c.custom && !c.reviewed && (
        <Btn kind="secondary" small disabled={busy} onClick={() => change.mutate(() => conexionesApi.review(slug, agent, c.server))} data-control={`revisar-${c.server}`}>
          {w.review}
        </Btn>
      )}
      <p className="cor-cap" data-uso>
        {w.usage(c.usage.calls, c.usage.runs)}
        {c.usage.failed > 0 && <> · {w.failed(c.usage.failed)}</>}
        {c.usage.blocked > 0 && (
          <>
            {" · "}
            <span className="cnx-warn">{w.blocked(c.usage.blocked)}</span>
          </>
        )}
      </p>
      {c.recent.length > 0 && (
        <div className="cnx-recent">
          <Label as="p">{w.recentHead}</Label>
          <ul className="cnx-log" data-recientes={c.server}>
            {c.recent.map((x) => (
              <li key={x.run}>
                <time dateTime={x.at}>{day(x.at)}</time>
                <span className="cor-mono">{x.task ?? w.noTicket}</span>
                <span className="cor-cap cor-mono">
                  {w.calls(x.calls)}
                  {x.blocked > 0 && (
                    <>
                      {" · "}
                      <span className="cnx-bad">{w.blocked(x.blocked)}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {c.usage.tools.length > 0 && (
        <details className="cnx-did">
          <summary className="cor-cap">{w.whatItDid}</summary>
          <ul className="cnx-tools">
            {c.usage.tools.slice(0, 12).map((t) => (
              <li key={t.tool}>
                <span className="cor-mono">{t.tool}</span>
                <span className="cor-cap cor-mono">
                  {t.ok}
                  {t.failed ? ` · ${w.failed(t.failed)}` : ""}
                  {t.blocked ? ` · ${w.blocked(t.blocked)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {c.keys.length > 0 && (
        <ul className="cnx-tools">
          {c.keys.map((k) => (
            <li key={k.env}>
              <span className="cor-mono">{k.name}</span>
              <span className={`cor-cap ${k.set ? "" : "cnx-warn"}`}>{k.set ? w.keySet : w.keyMissing}</span>
            </li>
          ))}
        </ul>
      )}
      {c.writes.length > 0 && (
        <div className="cnx-writes" role="group" aria-label={w.writeTools}>
          <Label as="p">{w.writeTools}</Label>
          {c.writes.map((t) => (
            <Switch key={t.tool} on={t.on} label={t.tool} disabled={busy} onChange={(on) => change.mutate(() => conexionesApi.setWrite(slug, agent, c.server, t.tool, on))} data-control={`escribe-${c.server}-${t.tool}`} />
          ))}
          <p className="cor-cap">{w.writeHint}</p>
        </div>
      )}
      {c.never.length > 0 && <p className="cor-cap">{w.never(c.never.join(", "))}</p>}
      {change.isError && <Failed error={change.error} />}
      <Btn kind="quiet" small disabled={busy} onClick={() => change.mutate(() => conexionesApi.disconnect(slug, agent, c.server))} data-control={`desconectar-${c.server}`}>
        {w.disconnect}
      </Btn>
    </section>
  );
};

// ---- the catalog, wide

export const CatalogPanel = ({
  p,
  m,
  seat,
  onClose,
  onConnect = () => undefined,
  onExpert = () => undefined,
}: {
  p: OrgProject;
  m: OrgMember;
  seat: string;
  onClose: () => void;
  onConnect?: (server: string) => void;
  onExpert?: () => void;
}) => {
  const w = W();
  const q = useConexiones(p.slug, m.agent);
  const r = q.data;
  const team = p.team.filter((x) => !x.agent.startsWith("propuesta:"));
  return (
    <section className="cor-card ofi-side-card cnx-catalog" aria-label={w.catalogTitle} data-catalogo>
      <div className="ofi-side-head">
        <Label as="h3">{`${w.catalogTitle} · ${seat}`}</Label>
        <Btn kind="quiet" small onClick={onClose} data-control="volver-conexiones">
          {w.back}
        </Btn>
      </div>
      <p className="cor-cap">
        {r ? `${w.catalogCount(r.catalog.length)}. ` : ""}
        {w.catalogHint}
      </p>
      {q.isError ? (
        <ReadError what={w.readError} onRetry={() => void q.refetch()} />
      ) : !r ? (
        <Loading />
      ) : (
        <>
          {catalogSections(r.catalog).map((s) => (
            <div key={s.id} className="cnx-section" data-section={s.id}>
              <Label as="h3" tone={s.id === "recomendadas" ? "violet" : undefined}>
                {w.groups[s.id]}
              </Label>
              <div className="cnx-grid">
                {s.items.map((it) => (
                  <CatalogCard key={it.id} it={it} seat={seat} team={team} rec={s.id === "recomendadas"} onConnect={() => onConnect(it.id)} />
                ))}
              </div>
            </div>
          ))}
          <div className="cnx-expert">
            <p className="cor-cap cor-muted">{w.expertHint}</p>
            <Btn kind="secondary" small onClick={onExpert} data-control="catalogo-experto">
              {w.expert}
            </Btn>
          </div>
        </>
      )}
    </section>
  );
};

const CatalogCard = ({ it, seat, team, rec, onConnect }: { it: CatalogItem; seat: string; team: OrgMember[]; rec: boolean; onConnect: () => void }) => {
  const w = W();
  const e = w.entries[it.id];
  const action = catalogAction(it);
  const users = it.used_by.map((slug) => team.find((x) => x.agent === slug)).filter((x): x is OrgMember => !!x);
  const writes = it.writes.length > 0;
  return (
    <article className={`cnx-entry ${it.connected ? "on" : ""} ${rec ? "rec" : ""} ${action === "no-corre-sola" ? "off" : ""}`} data-entrada={it.id}>
      <div className="cnx-entry-top">
        <span className="cnx-mark">{markOf(e?.name ?? it.id)}</span>
        <span>
          <b>{e?.name ?? it.id}</b>
          <span className="cor-cap">
            {w.makerBy(it.maker)} · {w.version(it.version)}
          </span>
        </span>
      </div>
      {e && <p className="cor-cap">{e.para}</p>}
      <div className="cnx-chips">
        <span className={`cnx-chip ${it.price === "pago" ? "rd" : it.price === "por-confirmar" ? "am" : "ok"}`}>{w.price[it.price]}</span>
        {it.keys.some((k) => !k.optional) && <span className="cnx-chip vi">{w.needsKey}</span>}
        <span className={`cnx-chip ${writes ? "am" : "ok"}`}>{writes ? w.readsWrites : w.onlyReads}</span>
        <span className="cnx-chip">{w.toolsN(it.reads + it.writes.length)}</span>
      </div>
      {e && <p className="cor-cap cor-muted">{e.ojo}</p>}
      {it.needs && <p className="cor-cap">{w.needs[it.needs]}</p>}
      {action === "no-corre-sola" && <p className="cor-cap cnx-warn">{w.needsLogin}</p>}
      <div className="cnx-entry-foot">
        <span className="cnx-who" title={w.whoUses} data-usan={it.used_by.join(" ")}>
          {users.length ? (
            users.map((u) => (
              <i key={u.agent} title={seatOf(u)}>
                {seatOf(u).slice(0, 2)}
              </i>
            ))
          ) : (
            <span className="cor-cap">{w.nobody}</span>
          )}
        </span>
        {action === "conectada" ? (
          <span className="cnx-chip ok" data-conectada={it.id}>
            {w.connected}
          </span>
        ) : action === "no-corre-sola" ? (
          <span className="cnx-chip rd">{w.notAlone}</span>
        ) : (
          <Btn kind="secondary" small onClick={onConnect} data-control={`conectar-${it.id}`}>
            {w.connectTo(seat)}
          </Btn>
        )}
      </div>
    </article>
  );
};

// ---- the connect sheet, wide: what it may do, its key, for whom

export const ConnectSheet = ({
  p,
  m,
  seat,
  server,
  request = null,
  onBack,
  onDone,
}: {
  p: OrgProject;
  m: OrgMember;
  seat: string;
  server: string;
  /** An agent's request: Conectar answers it (this seat only). */
  request?: string | null;
  onBack: () => void;
  onDone: () => void;
}) => {
  const w = W();
  const q = useConexiones(p.slug, m.agent);
  const change = useChange(p.slug, m.agent);
  const client = useQueryClient();
  const it = q.data?.catalog.find((c) => c.id === server);
  const llaves = q.data?.llaves ?? [];
  const [s, setS] = useState<Sheet | null>(null);
  if (q.isError) return <ReadError what={w.readError} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading />;
  if (!it) return <Failed error={new ApiError(404, "CONNECTION_UNKNOWN", {})} />;
  const sheet = s ?? sheetStart(it, m.agent, llaves);
  const e = w.entries[it.id];
  const sum = sheetSummary(it, sheet);
  const team = request ? [] : p.team.filter((x) => x.agent !== m.agent && !x.agent.startsWith("propuesta:"));
  const toggle = (list: string[], x: string) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const submit = () => {
    const body = sheetBody(it, sheet, m.agent);
    change.mutate(() => (request ? conexionesApi.decide(p.slug, m.agent, request, true, { keys: body.keys, writes: body.writes }) : conexionesApi.connect(p.slug, m.agent, it.id, body)), {
      onSuccess: () => {
        for (const a of body.agents) void client.invalidateQueries({ queryKey: ["conexiones", p.slug, a] });
        onDone();
      },
    });
  };
  return (
    <section className="cor-card ofi-side-card cnx-catalog" aria-label={w.sheetTitle(e?.name ?? it.id)} data-conectar={it.id}>
      <div className="ofi-side-head">
        <Btn kind="quiet" small onClick={onBack} data-control="volver-catalogo">
          {request ? w.back : w.backToCatalog}
        </Btn>
        <span className="cor-cap">{w.makerBy(it.maker)}</span>
      </div>
      <div className="cnx-sheet">
        <div className="cnx">
          <div className="cnx-entry-top">
            <span className="cnx-mark big">{markOf(e?.name ?? it.id)}</span>
            <span>
              <b className="cnx-sheet-title">{w.sheetTitle(e?.name ?? it.id)}</b>
              {e && <span className="cor-cap">{e.para}</span>}
            </span>
          </div>
          <div className="cnx-step" data-paso="1">
            <span className="cnx-step-h">
              <i>1</i>
              {w.stepDo}
            </span>
            <ul className="cnx-perm">
              {it.readTools.map((t) => (
                <li key={t}>
                  <Switch on label={t} disabled onChange={() => undefined} data-lee={t} />
                </li>
              ))}
              {it.writes.map((t) => (
                <li key={t} className="w">
                  <Switch on={sheet.writes.includes(t)} label={t} onChange={() => setS({ ...sheet, writes: toggle(sheet.writes, t) })} data-control={`hoja-escribe-${t}`} />
                  <span className="cnx-chip am">{w.writesTag}</span>
                </li>
              ))}
              {it.never.map((t) => (
                <li key={t} className="never">
                  <span className="cor-mono">{t}</span>
                  <span className="cnx-chip rd">{w.neverTool}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="cnx-step" data-paso="2">
            <span className="cnx-step-h">
              <i>2</i>
              {w.stepKey}
            </span>
            {it.keys.length === 0 ? (
              <p className="cor-cap cor-muted">{w.noKey}</p>
            ) : (
              <>
                {it.keys.map((k) => (
                  <label key={k.env} className="ofi-field">
                    <Label>{k.optional ? w.keyOptional : w.key}</Label>
                    <select className="cor-input cor-mono" value={sheet.keys[k.env] ?? ""} onChange={(ev) => setS({ ...sheet, keys: { ...sheet.keys, [k.env]: ev.target.value } })} data-control={`hoja-llave-${k.env}`}>
                      {k.optional && <option value="">{w.keyNone}</option>}
                      {keyChoices(k.name, llaves).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <p className="cor-cap cnx-warn" data-aviso-llave>
                  {w.keyWarn}
                </p>
                <p className="cor-cap cor-muted">{w.keyHint}</p>
              </>
            )}
          </div>
          <div className="cnx-step" data-paso="3">
            <span className="cnx-step-h">
              <i>3</i>
              {w.stepWho}
            </span>
            <div className="cnx-pick">
              <button type="button" aria-pressed="true" disabled data-control={`hoja-para-${m.agent}`}>
                <span className="org-glyph">{seat.slice(0, 2)}</span>
                {seat}
              </button>
              {team.map((x) => (
                <button key={x.agent} type="button" aria-pressed={sheet.agents.includes(x.agent)} onClick={() => setS({ ...sheet, agents: toggle(sheet.agents, x.agent) })} data-control={`hoja-para-${x.agent}`}>
                  <span className="org-glyph">{seatOf(x).slice(0, 2)}</span>
                  {seatOf(x)}
                </button>
              ))}
            </div>
            {request && <p className="cor-cap cor-muted">{w.requestOnly(seat)}</p>}
          </div>
        </div>
        <aside className="cnx-side" aria-label={w.sumHead} data-resumen>
          <Label>{w.sumHead}</Label>
          <dl>
            <div>
              <dt>{w.sumVersion}</dt>
              <dd>{w.version(it.version)}</dd>
            </div>
            <div>
              <dt>{w.sumRuns}</dt>
              <dd>{it.remote ? w.runsRemote : w.runsLocal}</dd>
            </div>
            <div>
              <dt>{w.sumPrice}</dt>
              <dd className={isPaid(it.price) ? "cnx-warn" : ""}>{w.price[it.price]}</dd>
            </div>
            <div>
              <dt>{w.sumTools}</dt>
              <dd>{sum.tools}</dd>
            </div>
            <div>
              <dt>{w.sumWrites}</dt>
              <dd data-escribe>{w.writesOf(sum.writesOn, sum.writesTotal)}</dd>
            </div>
            <div>
              <dt>{w.sumAgents}</dt>
              <dd>{sum.agents}</dd>
            </div>
          </dl>
          {e && (
            <p className="cor-cap">
              <b>{w.ojo}</b> {e.ojo}
            </p>
          )}
          {change.isError && <Failed error={change.error} />}
          <Btn kind="primary" disabled={change.isPending || !it.unattended} onClick={submit} data-control="hoja-conectar">
            {change.isPending ? w.connecting : w.doConnect(sum.agents)}
          </Btn>
        </aside>
      </div>
    </section>
  );
};

// ---- expert mode, wide: what the next run gets, and one of the owner's own

export const ExpertPanel = ({ p, m, seat, onClose }: { p: OrgProject; m: OrgMember; seat: string; onClose: () => void }) => {
  const w = W();
  const q = useQuery({ queryKey: ["conexiones-corrida", p.slug, m.agent], queryFn: () => conexionesApi.preview(p.slug, m.agent) });
  const pv = q.data;
  return (
    <section className="cor-card ofi-side-card cnx-catalog" aria-label={w.expertTitle} data-experto>
      <div className="ofi-side-head">
        <Label as="h3">{`${w.expertTitle} · ${seat}`}</Label>
        <Btn kind="quiet" small onClick={onClose} data-control="volver-conexiones">
          {w.back}
        </Btn>
      </div>
      <div className="cnx-sheet">
        <div className="cnx">
          <Label>{w.nextRun}</Label>
          {q.isError ? (
            <ReadError what={w.previewError} onRetry={() => void q.refetch()} />
          ) : !pv ? (
            <Loading />
          ) : (
            <pre className="cnx-code" tabIndex={0} data-corrida>
              <span className="c">{w.planiaAlways}</span>
              {"\n"}
              {JSON.stringify({ mcpServers: pv.servers }, null, 2)}
              {previewTools(pv).map((t) => (
                <span key={t.server}>
                  {"\n\n"}
                  <span className="c">{w.allowedHead(t.server)}</span>
                  {t.allow.length ? (
                    t.allow.map((x) => <span key={x} className="s">{`\nmcp__${t.server}__${x}`}</span>)
                  ) : (
                    <span className="c">{`\n${w.noneCode}`}</span>
                  )}
                  {"\n"}
                  <span className="c">{w.deniedHead(t.server)}</span>
                  {t.deny.length ? (
                    t.deny.map((x) => <span key={x} className="d">{`\nmcp__${t.server}__${x}`}</span>)
                  ) : (
                    <span className="c">{`\n${w.noneCode}`}</span>
                  )}
                </span>
              ))}
              {pv.skipped.length > 0 && (
                <>
                  {"\n\n"}
                  <span className="c">{w.skippedHead}</span>
                  {pv.skipped.map((x) => (
                    <span key={x.server} className="d">{`\n${x.server}: ${w.skip[x.why] ?? x.why}`}</span>
                  ))}
                </>
              )}
              {pv.keys.length > 0 && (
                <>
                  {"\n\n"}
                  <span className="c">{w.keysHead}</span>
                  {pv.keys.map((k) => (
                    <span key={k} className="k">{`\n${k}`}</span>
                  ))}
                </>
              )}
            </pre>
          )}
          <p className="cor-cap cor-muted">{w.keyHint}</p>
        </div>
        <ExpertForm slug={p.slug} agent={m.agent} />
      </div>
    </section>
  );
};

const ExpertForm = ({ slug, agent }: { slug: string; agent: string }) => {
  const w = W();
  const change = useChange(slug, agent);
  const empty = { server: "", package: "", version: "", args: "", allow: "" };
  const [d, setD] = useState(empty);
  const ready = d.server.trim() && d.package.trim() && d.version.trim();
  const fields = ["server", "package", "version", "args", "allow"] as const;
  const labelOf = (f: (typeof fields)[number]) => (f === "server" ? w.expertName : f === "package" ? w.expertPackage : f === "version" ? w.expertVersion : f === "args" ? w.expertArgs : w.expertAllow);
  return (
    <aside className="cnx-side" aria-label={w.expert} data-propia>
      <Label>{w.expert}</Label>
      <p className="cor-cap cor-muted">{w.expertHint}</p>
      {fields.map((f) => (
        <label key={f} className="ofi-field">
          <Label>{labelOf(f)}</Label>
          <input className="cor-input cor-mono" maxLength={f === "allow" ? 600 : 120} value={d[f]} onChange={(ev) => setD({ ...d, [f]: f === "server" ? ev.target.value.toLowerCase() : ev.target.value })} data-control={`propia-${f}`} />
        </label>
      ))}
      {change.isError && <Failed error={change.error} />}
      <Btn
        kind="secondary"
        small
        disabled={!ready || change.isPending}
        onClick={() =>
          change.mutate(
            () =>
              conexionesApi.addCustom(slug, agent, {
                server: d.server.trim(),
                package: d.package.trim(),
                version: d.version.trim(),
                args: d.args.split(/\s+/).filter(Boolean),
                allow: d.allow
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              }),
            { onSuccess: () => setD(empty) },
          )
        }
        data-control="propia-agregar"
      >
        {w.expertAdd}
      </Btn>
    </aside>
  );
};
