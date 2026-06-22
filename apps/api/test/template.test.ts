import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("react vite template", () => {
  it("contains the files required for preview", () => {
    const root = path.resolve(process.cwd(), "templates/react-vite");
    expect(existsSync(path.join(root, "package.json"))).toBe(true);
    expect(existsSync(path.join(root, "index.html"))).toBe(true);
    expect(existsSync(path.join(root, "src/App.tsx"))).toBe(true);
    expect(existsSync(path.join(root, "src/main.tsx"))).toBe(true);
  });
});

describe("vue vite template", () => {
  it("contains the files required for preview", () => {
    const root = path.resolve(process.cwd(), "templates/vue-vite");
    expect(existsSync(path.join(root, "package.json"))).toBe(true);
    expect(existsSync(path.join(root, "index.html"))).toBe(true);
    expect(existsSync(path.join(root, "src/App.vue"))).toBe(true);
    expect(existsSync(path.join(root, "src/main.ts"))).toBe(true);
  });
});
