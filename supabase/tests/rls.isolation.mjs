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

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

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

before(async () => {
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
  await client.connect();

  await client.query(fs.readFileSync(path.join(here, "mock_supabase.sql"), "utf8"));
  // Apply every migration TWICE: it must be safe to re-run.
  for (let round = 1; round <= 2; round++) {
    for (const file of migrationFiles) {
      await client.query(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
    }
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
  await pg?.stop();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("sign up", () => {
  test("a profile is created automatically, external AI is OFF", async () => {
    const { rows } = await client.query(
      "select display_name, allow_external_ai, preferred_language from public.profiles where id = $1",
      [USER_A],
    );
    assert.equal(rows[0].display_name, "Alice");
    assert.equal(rows[0].allow_external_ai, false);
    assert.equal(rows[0].preferred_language, "bn");
  });

  test("the documents bucket is private", async () => {
    const { rows } = await client.query(
      "select public from storage.buckets where id = 'documents'",
    );
    assert.equal(rows[0].public, false);
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
        `insert into public.documents (name, storage_path, folder_id, size_bytes, is_sensitive)
         values ('nid.pdf', $1, $2, 1234, true) returning id, status`,
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

  test("B cannot turn on external AI for A", async () => {
    await as(USER_B, async (q) => {
      const r = await q("update public.profiles set allow_external_ai = true where id = $1", [
        USER_A,
      ]);
      assert.equal(r.rowCount, 0);
    });
    const { rows } = await client.query(
      "select allow_external_ai from public.profiles where id = $1",
      [USER_A],
    );
    assert.equal(rows[0].allow_external_ai, false);
  });
});

describe("logged-out visitors (anon) get nothing", () => {
  for (const table of ["public.folders", "public.documents", "public.profiles"]) {
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
