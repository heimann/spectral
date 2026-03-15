import yaml from "js-yaml";
import { readFileSync } from "fs";

export interface Assertion {
  text: string;
  with?: Record<string, string>;
  deps?: string[];
}

export interface Spec {
  suite: string;
  target: string;
  assertions: Assertion[];
}

export function parseSpec(path: string): Spec {
  const raw = yaml.load(readFileSync(path, "utf8")) as any;

  if (!raw.suite || !raw.target || !raw.assertions) {
    throw new Error(`Invalid spec ${path}: needs suite, target, assertions`);
  }

  const assertions: Assertion[] = raw.assertions.map((a: any) => {
    if (typeof a === "string") {
      return { text: a };
    }
    // Object form: { "assertion text": { with: {...}, deps: [...] } }
    const [text, opts] = Object.entries(a)[0] as [string, any];
    return {
      text,
      with: opts?.with,
      deps: opts?.deps,
    };
  });

  return {
    suite: raw.suite,
    target: raw.target,
    assertions,
  };
}
