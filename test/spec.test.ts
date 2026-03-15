import { describe, test, expect } from "bun:test";
import { parseSpec } from "../src/spec";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function withTempSpec(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "spectral-test-"));
  const path = join(dir, "test.yml");
  writeFileSync(path, content);
  return path;
}

describe("parseSpec", () => {
  test("parses simple string assertions", () => {
    const path = withTempSpec(`
suite: Test
target: http://localhost:3000
assertions:
  - Page has a title
  - Page has a button
`);
    const spec = parseSpec(path);
    expect(spec.suite).toBe("Test");
    expect(spec.target).toBe("http://localhost:3000");
    expect(spec.assertions).toHaveLength(2);
    expect(spec.assertions[0].text).toBe("Page has a title");
    expect(spec.assertions[1].text).toBe("Page has a button");
    expect(spec.assertions[0].with).toBeUndefined();
    expect(spec.assertions[0].deps).toBeUndefined();
  });

  test("parses object-form assertions with 'with' context", () => {
    const path = withTempSpec(`
suite: Auth
target: http://localhost:4000/login
assertions:
  - Valid credentials redirect to /dashboard:
      with:
        email: test@example.com
        password: secret123
`);
    const spec = parseSpec(path);
    expect(spec.assertions).toHaveLength(1);
    expect(spec.assertions[0].text).toBe("Valid credentials redirect to /dashboard");
    expect(spec.assertions[0].with).toEqual({
      email: "test@example.com",
      password: "secret123",
    });
  });

  test("parses object-form assertions with 'deps'", () => {
    const path = withTempSpec(`
suite: Auth
target: http://localhost:4000/login
assertions:
  - Login page renders fields:
      deps:
        - lib/login.ex
        - assets/app.css
`);
    const spec = parseSpec(path);
    expect(spec.assertions[0].deps).toEqual([
      "lib/login.ex",
      "assets/app.css",
    ]);
  });

  test("handles mixed string and object assertions", () => {
    const path = withTempSpec(`
suite: Mixed
target: http://localhost:3000
assertions:
  - Simple assertion
  - Complex assertion:
      with:
        key: value
  - Another simple one
`);
    const spec = parseSpec(path);
    expect(spec.assertions).toHaveLength(3);
    expect(spec.assertions[0].text).toBe("Simple assertion");
    expect(spec.assertions[0].with).toBeUndefined();
    expect(spec.assertions[1].text).toBe("Complex assertion");
    expect(spec.assertions[1].with).toEqual({ key: "value" });
    expect(spec.assertions[2].text).toBe("Another simple one");
  });

  test("throws on missing suite", () => {
    const path = withTempSpec(`
target: http://localhost:3000
assertions:
  - Something
`);
    expect(() => parseSpec(path)).toThrow("needs suite, target, assertions");
  });

  test("throws on missing target", () => {
    const path = withTempSpec(`
suite: Test
assertions:
  - Something
`);
    expect(() => parseSpec(path)).toThrow("needs suite, target, assertions");
  });

  test("throws on missing assertions", () => {
    const path = withTempSpec(`
suite: Test
target: http://localhost:3000
`);
    expect(() => parseSpec(path)).toThrow("needs suite, target, assertions");
  });
});
