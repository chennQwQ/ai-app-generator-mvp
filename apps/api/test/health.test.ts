import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";

describe("health route", () => {
  it("returns ok", async () => {
    const app = await createServer(loadConfig({}));
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });
});
