/**
 * Removes everything the end-to-end suite created.
 *
 * The suite has its own organisation, so its rows are already invisible to the
 * demo session — this is for when you want them gone from the database as
 * well, without the full `db:reset` cycle.
 *
 * Most tables cascade from organisations, but freight bills must go first:
 * bill_lines.consignment_id is ON DELETE RESTRICT on purpose, so that a
 * consignment which has been billed can never be deleted out from under its
 * invoice. Removing the bills releases that hold, and the organisation cascade
 * then takes consignments, events, tokens, expenses, PODs, parties, vehicles
 * and drivers with it.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";

config({ path: ".env.local" });

const db = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** Organisations that only ever exist because tests ran. */
const TEST_ORGS = ["E2E Test Transport", "Rival Transport Co"];
const TEST_EMAIL_DOMAINS = ["@e2e.test", "@rivaltransport.test"];

async function main() {
  let removed = 0;

  for (const name of TEST_ORGS) {
    const { data: org } = await db
      .from("organisations").select("id").eq("legal_name", name).maybeSingle();
    if (!org) continue;

    // Bills first — see the note above about ON DELETE RESTRICT.
    const { error: billErr } = await db
      .from("freight_bills").delete().eq("org_id", org.id);
    if (billErr) throw new Error(`${name} bills: ${billErr.message}`);

    const { error } = await db.from("organisations").delete().eq("id", org.id);
    if (error) throw new Error(`${name}: ${error.message}`);
    console.log(`  removed ${name} and everything under it`);
    removed += 1;
  }

  // Auth users are not owned by the organisation, so they need their own pass.
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users?.users ?? []) {
    if (!u.email) continue;
    if (!TEST_EMAIL_DOMAINS.some((d) => u.email!.endsWith(d))) continue;
    await db.auth.admin.deleteUser(u.id);
    console.log(`  removed ${u.email}`);
    removed += 1;
  }

  const { count } = await db
    .from("consignments").select("id", { count: "exact", head: true });

  console.log(
    removed === 0
      ? "\nNothing to clean.\n"
      : `\nDone. ${count ?? 0} consignments remain — the demo organisation's.\n`,
  );
}

main().catch((err) => {
  console.error("\nClean failed:", err.message);
  process.exit(1);
});
