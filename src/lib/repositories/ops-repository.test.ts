import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { appDispatchOrderPersistenceColumns, appPaymentPersistenceColumns } from "./ops-repository";

const migrationSql = [
  "0001_core.sql",
  "0013_dispatch_order_detail_fields.sql",
  "0021_finance_schema_alignment.sql",
  "0022_driver_trip_reports.sql"
]
  .map((file) => readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8"))
  .join("\n");

describe("Supabase app schema alignment", () => {
  it("keeps dispatch order persistence columns present in migrations", () => {
    for (const column of appDispatchOrderPersistenceColumns) {
      expect(migrationSql).toContain(column);
    }
  });

  it("keeps payment persistence columns present in migrations", () => {
    for (const column of appPaymentPersistenceColumns) {
      expect(migrationSql).toContain(column);
    }
  });
});
