# Spectral v1 Design

Date: 2026-03-15

## What

A Bun CLI that parses YAML spec files containing natural-language assertions about a web app, then uses agent-browser + PI SDK to verify each assertion passes.

## Target

Local Political Radar (Phoenix/LiveView on localhost:4000) as the first test subject.

## Architecture

```
spectral run specs/auth.yml
       |
       v
  Parse YAML -> list of { suite, target, assertions[] }
       |
       v
  For each suite:
    PI Agent with agent-browser tools
       |
       v
    For each assertion:
      1. agent-browser open {target}
      2. agent-browser snapshot
      3. PI judges: pass/fail with reasoning
      4. If actions needed: agent calls click/fill/etc, re-snapshots, re-judges
       |
       v
  Print results to stdout
```

## Key decisions

- PI SDK as the agent runtime. The judge is a PI agent with agent-browser commands exposed as tools. This lets it do multi-step interactions (fill a form, click submit, check result) without us writing orchestration code.
- agent-browser as subprocess. Spawned via Bun.spawn, commands sent as CLI invocations. Each suite gets its own browser session.
- YAML spec format matches the architecture doc.
- No cache, no dep inference, no reports in v1. Just parse, run, print.

## Project structure

```
~/code/spectral/
├── src/
│   ├── index.ts        # CLI entry point
│   ├── spec.ts         # YAML parsing
│   └── runner.ts       # PI agent + agent-browser tools, runs assertions
├── specs/              # example specs for radar
│   └── auth.yml
├── package.json
└── tsconfig.json
```

## Spec format

```yaml
suite: Authentication
target: http://localhost:4000/login

assertions:
  - Login page renders email and password fields
  - Submitting empty form shows validation errors
  - Valid credentials redirect to /dashboard:
      with:
        email: test@example.com
        password: ${TEST_PASSWORD}
```

## Output format

```
spectral v0.1.0

> Authentication (localhost:4000/login)
  pass  Login page renders email and password fields     1.2s
  pass  Submitting empty form shows validation errors    2.4s
  fail  Invalid credentials show an error, not a crash   3.1s
        Got a 500 page instead of a user-facing error

1 failed, 2 passed (3 total) - 6.7s
```

Exit 0 if all pass, exit 1 if any fail.

## Dependencies

- @mariozechner/pi-agent-core + @mariozechner/pi-ai (PI SDK)
- js-yaml (YAML parsing)
- agent-browser (npm global install)

## Not in v1

- Content-addressed cache
- Dependency inference
- HTML/JSON reports
- spectral diff
- Concurrency across suites
- Setup/seed commands
- depends_on between suites
