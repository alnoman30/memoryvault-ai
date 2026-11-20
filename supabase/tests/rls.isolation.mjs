// Database security test.
//
// Starts a throw-away local Postgres, applies supabase/migrations/*.sql and
// proves that:
//   - a logged-in user CAN create folders and documents (the "permission
//     denied for table folders" bug cannot come back),
//   - one user can NOT read, change, delete or attach to another user's data,
//   - logged-out visitors (anon) can do nothing,
//   - the migration can safely be run twice.
//
// Run:  cd supabase/tests && npm install && npm test
// (Postgres refuses to run as root; on Linux run it as a normal user.)
//
// Migration 0002 needs the pgvector extension. The bundled throw-away Postgres
// does not ship it, so point the test at any Postgres that has pgvector:
//   TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test
// A fresh database called "mvtest" is created there and dropped afterwards.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pgPackage from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "..", "migrations");
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

let pg;
let client;
let dataDir;

// Runs `fn(q)` as a logged-in user (or anon when userId is null), the same
// way Supabase does: switch role + set the JWT subject for auth.uid().
async function as(userId, fn, { commit = false } = {}) {
  await client.query("begin");
  try {
    await client.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
      userId ?? "",
    ]);
    const result = await fn((sql, params) => client.query(sql, params));
    await client.query(commit ? "commit" : "rollback");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

// Expects the statement to be refused, and returns the error message.
async function refused(userId, sql, params) {
  try {
    await as(userId, (q) => q(sql, params));
  } catch (error) {
    return error.message;
  }
  assert.fail(`Expected this to be refused, but it worked: ${sql}`);
}

let adminUrl = process.env.TEST_DATABASE_URL;

before(async () => {
  if (adminUrl) {
    const admin = new pgPackage.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query("drop database if exists mvtest with (force)");
    await admin.query("create database mvtest");
    await admin.end();
    const url = new URL(adminUrl);
    url.pathname = "/mvtest";
    client = new pgPackage.Client({ connectionString: url.toString() });
  } else {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-pg-"));
    pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: "postgres",
      password: "password",
      port: 54329,
      persistent: false,
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("mvtest");
    client = pg.getPgClient("mvtest");
  }
  await client.connect();

  await client.query(fs.readFileSync(path.join(here, "mock_supabase.sql"), "utf8"));
  // Apply every migration TWICE: it must be safe to re-run.
  for (let round = 1; round <= 2; round++) {
    for (const file of migrationFiles) {
      await client.query(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
    }
  }

  // Simulate a project that already has hand-made leftovers: a helper with
  // different parameter names, a wide-open policy, and a differently named
  // policy. Applying the migration again must clean all of that up.
  await client.query(`
    drop function public.owns_folder(uuid) cascade;
    create function public.owns_folder(folder uuid) returns boolean
      language sql security definer set search_path = '' as
      $$ select true $$;
    create policy "stray_open_read" on public.folders for select to authenticated using (true);
    create policy "stray_open_docs" on public.documents for select to authenticated using (true);
    create policy "stray_storage" on storage.objects for select to authenticated
      using (bucket_id = 'documents');
  `);
  for (const file of migrationFiles) {
    await client.query(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
  }

  await client.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'a@example.com', '{"display_name":"Alice"}'),
       ($2, 'b@example.com', '{}')`,
    [USER_A, USER_B],
  );
});

after(async () => {
  await client?.end();
  if (adminUrl) {
    const admin = new pgPackage.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query("drop database if exists mvtest with (force)");
    await admin.end();
  }
  await pg?.stop();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("migration on a project that already has leftovers", () => {
  test("old helper and loose policies are gone, only our policies remain", async () => {
    const { rows } = await client.query(
      `select policyname from pg_policies
       where (schemaname = 'public' and tablename in ('profiles','folders','documents'))
          or (schemaname = 'storage' and tablename = 'objects')
       order by policyname`,
    );
    const names = rows.map((r) => r.policyname);
    assert.ok(!names.some((n) => n.startsWith("stray_")), `stray policy left: ${names}`);
    assert.equal(names.length, 14, `unexpected policies: ${names}`);

    const fn = await client.query(
      `select pg_get_function_arguments(oid) as args
       from pg_proc where proname = 'owns_folder' and pronamespace = 'public'::regnamespace`,
    );
    assert.equal(fn.rows.length, 1);
    assert.equal(fn.rows[0].args, "target uuid");
  });
});

describe("sign up", () => {
  test("a profile is created automatically", async () => {
    const { rows } = await client.query(
      "select display_name, preferred_language from public.profiles where id = $1",
      [USER_A],
    );
    assert.equal(rows[0].display_name, "Alice");
    assert.equal(rows[0].preferred_language, "bn");
  });

  test("the documents bucket is private and has no bucket size limit", async () => {
    const { rows } = await client.query(
      "select public, file_size_limit from storage.buckets where id = 'documents'",
    );
    assert.equal(rows[0].public, false);
    assert.equal(rows[0].file_size_limit, null);
  });

  test("the old sensitive-document columns are gone", async () => {
    const { rows } = await client.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and column_name in ('is_sensitive', 'allow_external_ai')`,
    );
    assert.equal(rows.length, 0);
  });
});

describe("logged-in user can do their own work (no 'permission denied')", () => {
  test("create a folder, a sub-folder, rename and delete", async () => {
    await as(
      USER_A,
      async (q) => {
        const top = await q("insert into public.folders (name) values ('Top') returning id");
        const topId = top.rows[0].id;
        const sub = await q(
          "insert into public.folders (name, parent_id) values ('Sub', $1) returning user_id",
          [topId],
        );
        assert.equal(sub.rows[0].user_id, USER_A, "user_id is filled from the login");
        const renamed = await q("update public.folders set name = 'Top 2' where id = $1", [topId]);
        assert.equal(renamed.rowCount, 1);
        const removed = await q("delete from public.folders where id = $1", [topId]);
        assert.equal(removed.rowCount, 1);
      },
      { commit: false },
    );
  });

  test("create a document inside own storage folder and own folder", async () => {
    await as(USER_A, async (q) => {
      const f = await q("insert into public.folders (name) values ('Docs') returning id");
      const d = await q(
        `insert into public.documents (name, storage_path, folder_id, size_bytes)
         values ('nid.pdf', $1, $2, 1234) returning id, status`,
        [`${USER_A}/aaa.pdf`, f.rows[0].id],
      );
      assert.equal(d.rows[0].status, "uploaded");
      await q("update public.documents set name = 'NID card.pdf' where id = $1", [d.rows[0].id]);
    });
  });

  test("upload an object into own storage folder", async () => {
    await as(USER_A, (q) =>
      q("insert into storage.objects (bucket_id, name) values ('documents', $1)", [
        `${USER_A}/aaa.pdf`,
      ]),
    );
  });

  test("update own profile", async () => {
    await as(USER_A, async (q) => {
      const r = await q("update public.profiles set preferred_language = 'en' where id = $1", [
        USER_A,
      ]);
      assert.equal(r.rowCount, 1);
    });
  });
});

describe("one user cannot touch another user's data", () => {
  let folderA;
  let docA;

  before(async () => {
    await as(
      USER_A,
      async (q) => {
        folderA = (await q("insert into public.folders (name) values ('A private') returning id"))
          .rows[0].id;
        docA = (
          await q(
            `insert into public.documents (name, storage_path, folder_id)
             values ('secret.pdf', $1, $2) returning id`,
            [`${USER_A}/secret.pdf`, folderA],
          )
        ).rows[0].id;
        await q("insert into storage.objects (bucket_id, name) values ('documents', $1)", [
          `${USER_A}/secret.pdf`,
        ]);
      },
      { commit: true },
    );
  });

  test("B sees none of A's folders, documents, profile or files", async () => {
    await as(USER_B, async (q) => {
      assert.equal((await q("select * from public.folders where id = $1", [folderA])).rowCount, 0);
      assert.equal((await q("select * from public.documents where id = $1", [docA])).rowCount, 0);
      assert.equal((await q("select * from public.profiles where id = $1", [USER_A])).rowCount, 0);
      assert.equal(
        (await q("select * from storage.objects where name = $1", [`${USER_A}/secret.pdf`])).rowCount,
        0,
      );
      assert.equal((await q("select * from public.folders")).rowCount, 0, "B has no folders of their own");
    });
  });

  test("A still sees their own data", async () => {
    await as(USER_A, async (q) => {
      assert.equal((await q("select * from public.documents where id = $1", [docA])).rowCount, 1);
    });
  });

  test("B cannot rename, move or delete A's document or folder", async () => {
    await as(USER_B, async (q) => {
      assert.equal(
        (await q("update public.documents set name = 'hacked' where id = $1", [docA])).rowCount,
        0,
      );
      assert.equal((await q("delete from public.documents where id = $1", [docA])).rowCount, 0);
      assert.equal(
        (await q("update public.folders set name = 'hacked' where id = $1", [folderA])).rowCount,
        0,
      );
      assert.equal((await q("delete from public.folders where id = $1", [folderA])).rowCount, 0);
      assert.equal(
        (await q("update public.profiles set display_name = 'x' where id = $1", [USER_A])).rowCount,
        0,
      );
      assert.equal(
        (await q("delete from storage.objects where name = $1", [`${USER_A}/secret.pdf`])).rowCount,
        0,
      );
    });
    // ...and the data is still intact afterwards.
    const { rows } = await client.query("select name from public.documents where id = $1", [docA]);
    assert.equal(rows[0].name, "secret.pdf");
  });

  test("B cannot put a folder inside A's folder", async () => {
    const message = await refused(
      USER_B,
      "insert into public.folders (name, parent_id) values ('sneaky', $1)",
      [folderA],
    );
    assert.match(message, /row-level security/i);
  });

  test("B cannot save a document into A's folder", async () => {
    const message = await refused(
      USER_B,
      "insert into public.documents (name, storage_path, folder_id) values ('x.pdf', $1, $2)",
      [`${USER_B}/x.pdf`, folderA],
    );
    assert.match(message, /row-level security/i);
  });

  test("B cannot move their own document into A's folder", async () => {
    let docB;
    await as(
      USER_B,
      async (q) => {
        docB = (
          await q(
            "insert into public.documents (name, storage_path) values ('b.pdf', $1) returning id",
            [`${USER_B}/b.pdf`],
          )
        ).rows[0].id;
      },
      { commit: true },
    );
    const message = await refused(
      USER_B,
      "update public.documents set folder_id = $1 where id = $2",
      [folderA, docB],
    );
    assert.match(message, /row-level security/i);
  });

  test("B cannot claim a file path inside A's storage folder", async () => {
    const asDocument = await refused(
      USER_B,
      "insert into public.documents (name, storage_path) values ('x.pdf', $1)",
      [`${USER_A}/stolen.pdf`],
    );
    assert.match(asDocument, /row-level security/i);

    const asObject = await refused(
      USER_B,
      "insert into storage.objects (bucket_id, name) values ('documents', $1)",
      [`${USER_A}/stolen.pdf`],
    );
    assert.match(asObject, /row-level security/i);
  });

  test("B cannot create a record that belongs to A", async () => {
    const message = await refused(
      USER_B,
      "insert into public.folders (name, user_id) values ('x', $1)",
      [USER_A],
    );
    assert.match(message, /row-level security/i);
  });

  test("B cannot change A's display name", async () => {
    await as(USER_B, async (q) => {
      const r = await q("update public.profiles set display_name = 'hacked' where id = $1", [
        USER_A,
      ]);
      assert.equal(r.rowCount, 0);
    });
  });
});

describe("AI search and chat stay private", () => {
  let docA;
  let docB;
  let convA;
  const vec = (x) => `[${Array.from({ length: 768 }, (_, i) => (i === x ? 1 : 0)).join(",")}]`;

  before(async () => {
    docA = await as(
      USER_A,
      async (q) => {
        const d = await q(
          "insert into public.documents (name, storage_path) values ('lease.pdf', $1) returning id",
          [`${USER_A}/lease-ai.pdf`],
        );
        const id = d.rows[0].id;
        await q(
          `insert into public.document_chunks (document_id, page, chunk_index, content, embedding)
           values ($1, 4, 0, 'The lease ends on 31 March 2028.', $2),
                  ($1, 5, 1, 'ভাড়া প্রতি মাসে ২০,০০০ টাকা।', $3)`,
          [id, vec(0), vec(1)],
        );
        const c = await q("insert into public.conversations (title) values ('Lease') returning id");
        convA = c.rows[0].id;
        await q(
          "insert into public.messages (conversation_id, role, content) values ($1, 'user', 'When does my lease end?')",
          [convA],
        );
        return id;
      },
      { commit: true },
    );
    docB = await as(
      USER_B,
      async (q) => {
        const d = await q(
          "insert into public.documents (name, storage_path) values ('b.pdf', $1) returning id",
          [`${USER_B}/bob-ai.pdf`],
        );
        await q(
          `insert into public.document_chunks (document_id, page, chunk_index, content, embedding)
           values ($1, 1, 0, 'Bob lease ends in 2030.', $2)`,
          [d.rows[0].id, vec(0)],
        );
        return d.rows[0].id;
      },
      { commit: true },
    );
  });

  test("hybrid search finds A's own chunks by meaning and by keyword", async () => {
    const rows = await as(USER_A, async (q) =>
      (await q("select * from public.match_chunks($1::extensions.vector, $2, 5)", [vec(0), "lease"])).rows,
    );
    assert.ok(rows.length >= 1);
    assert.equal(rows[0].document_name, "lease.pdf");
    assert.equal(rows[0].page, 4);
    assert.ok(rows.every((r) => r.document_id === docA), "only A's chunks");
  });

  test("keyword-only search works without an embedding, also for Bangla", async () => {
    const rows = await as(USER_A, async (q) =>
      (await q("select * from public.match_chunks(null, $1, 5)", ["ভাড়া"])).rows,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].page, 5);
  });

  test("B never gets A's chunks from search", async () => {
    const rows = await as(USER_B, async (q) =>
      (await q("select * from public.match_chunks($1::extensions.vector, $2, 20)", [vec(0), "lease"])).rows,
    );
    assert.ok(rows.length >= 1);
    assert.ok(rows.every((r) => r.document_id === docB));
  });

  test("B cannot read, add to or delete A's chunks", async () => {
    await as(USER_B, async (q) => {
      const r = await q("select * from public.document_chunks where document_id = $1", [docA]);
      assert.equal(r.rowCount, 0);
      const del = await q("delete from public.document_chunks where document_id = $1", [docA]);
      assert.equal(del.rowCount, 0);
    });
    assert.match(
      await refused(
        USER_B,
        "insert into public.document_chunks (document_id, chunk_index, content) values ($1, 9, 'x')",
        [docA],
      ),
      /row-level security/i,
    );
  });

  test("B cannot read or write A's conversations and messages", async () => {
    await as(USER_B, async (q) => {
      assert.equal((await q("select * from public.conversations")).rowCount, 0);
      assert.equal((await q("select * from public.messages")).rowCount, 0);
      const upd = await q("update public.conversations set title = 'x' where id = $1", [convA]);
      assert.equal(upd.rowCount, 0);
    });
    assert.match(
      await refused(
        USER_B,
        "insert into public.messages (conversation_id, role, content) values ($1, 'user', 'hi')",
        [convA],
      ),
      /row-level security/i,
    );
  });

  test("deleting a document removes its chunks", async () => {
    await as(
      USER_A,
      async (q) => {
        await q("delete from public.documents where id = $1", [docA]);
        const r = await q("select count(*)::int as n from public.document_chunks where document_id = $1", [docA]);
        assert.equal(r.rows[0].n, 0);
      },
      { commit: false },
    );
  });
});

describe("logged-out visitors (anon) get nothing", () => {
  for (const table of [
    "public.folders",
    "public.documents",
    "public.profiles",
    "public.document_chunks",
    "public.conversations",
    "public.messages",
  ]) {
    test(`cannot read ${table}`, async () => {
      assert.match(await refused(null, `select * from ${table}`), /permission denied/i);
    });
  }

  test("cannot create a folder", async () => {
    assert.match(
      await refused(null, "insert into public.folders (name) values ('x')"),
      /permission denied|row-level security|null value/i,
    );
  });

  test("cannot see storage files", async () => {
    assert.match(
      await refused(null, "select * from storage.objects"),
      /permission denied/i,
    );
  });
});

describe("profiles are created by the system only", () => {
  test("a logged-in user cannot insert or delete profiles directly", async () => {
    assert.match(
      await refused(USER_B, "insert into public.profiles (id) values (gen_random_uuid())"),
      /permission denied/i,
    );
    assert.match(
      await refused(USER_B, "delete from public.profiles where id = $1", [USER_B]),
      /permission denied/i,
    );
  });
});
