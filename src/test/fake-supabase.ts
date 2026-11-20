// A tiny in-memory stand-in for the parts of the Supabase client that the
// document processor uses. Only for unit tests.
type Row = Record<string, unknown>;

export function fakeSupabase(files: Record<string, Uint8Array>) {
  const tables: Record<string, Row[]> = { documents: [], document_chunks: [] };
  let nextId = 1;

  function builder(table: string) {
    let mode: "select" | "update" | "insert" | "delete" | "upsert" = "select";
    let countOnly = false;
    let values: Row | Row[] = {};
    const filters: ((r: Row) => boolean)[] = [];
    let orderBy: string | null = null;
    let max = Infinity;

    const rows = () => {
      let out = tables[table].filter((r) => filters.every((f) => f(r)));
      if (orderBy) out = [...out].sort((a, b) => Number(a[orderBy!]) - Number(b[orderBy!]));
      return out.slice(0, max);
    };

    const run = () => {
      if (mode === "insert") {
        const list = Array.isArray(values) ? values : [values];
        for (const v of list) tables[table].push({ id: `row-${nextId++}`, embedding: null, ...v });
        return { data: null, error: null };
      }
      if (mode === "upsert") {
        for (const v of values as Row[]) {
          const existing = tables[table].find((r) => r.id === v.id);
          if (existing) Object.assign(existing, v);
          else tables[table].push({ ...v });
        }
        return { data: null, error: null };
      }
      if (mode === "update") {
        for (const r of rows()) Object.assign(r, values);
        return { data: null, error: null };
      }
      if (mode === "delete") {
        const remove = new Set(rows());
        tables[table] = tables[table].filter((r) => !remove.has(r));
        return { data: null, error: null };
      }
      if (countOnly) return { data: null, count: rows().length, error: null };
      return { data: rows().map((r) => ({ ...r })), error: null };
    };

    const api = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => (
        (countOnly = Boolean(opts?.head)), api
      ),
      upsert: (v: Row[]) => ((mode = "upsert"), (values = v), api),
      insert: (v: Row | Row[]) => ((mode = "insert"), (values = v), api),
      update: (v: Row) => ((mode = "update"), (values = v), api),
      delete: () => ((mode = "delete"), api),
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), api),
      is: (col: string, v: unknown) => (filters.push((r) => (r[col] ?? null) === v), api),
      order: (col: string) => ((orderBy = col), api),
      limit: (n: number) => ((max = n), api),
      maybeSingle: async () => {
        const { data } = run();
        return { data: (data as Row[] | null)?.[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return api;
  }

  const client = {
    from: (table: string) => builder(table),
    storage: {
      from: () => ({
        download: async (path: string) =>
          files[path]
            ? { data: new Blob([new Uint8Array(files[path])]), error: null }
            : { data: null, error: { message: "not found" } },
      }),
    },
  };
  return { client, tables };
}
