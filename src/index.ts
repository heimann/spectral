import { parseSpec } from "./spec";
const spec = parseSpec(process.argv[2] || "specs/auth.yml");
console.log(JSON.stringify(spec, null, 2));
