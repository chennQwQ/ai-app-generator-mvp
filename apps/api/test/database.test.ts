import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/database.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("database schema", () => {
  it("creates required tables", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-db-"));
    const db = openDatabase(path.join(tempDir, "app.sqlite"));
    const tables = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all()
      .map((row: any) => row.name);
    expect(tables).toContain("projects");
    expect(tables).toContain("conversations");
    expect(tables).toContain("messages");
    expect(tables).toContain("agent_runs");
    expect(tables).toContain("agent_logs");
    db.close();
  });
});
