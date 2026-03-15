# spectral

Natural language e2e tests judged by AI.

Write assertions in plain English, spectral uses a headless browser + Claude to verify them.

```yaml
# specs/auth.yml
suite: Authentication
target: http://localhost:4000/login

assertions:
  - Login page renders email and password fields
  - Submitting empty form shows validation errors
  - Invalid credentials show an error, not a crash
```

```
$ spectral run specs/auth.yml

> Authentication (localhost:4000/login)
  pass  Login page renders email and password fields     1.2s
  pass  Submitting empty form shows validation errors    2.4s
  fail  Invalid credentials show an error, not a crash   3.1s
        Got a 500 page instead of a user-facing error

1 failed, 2 passed (3 total)
```

## Setup

Paste this into a chat with your AI agent:

```
Read https://raw.githubusercontent.com/heimann/spectral/main/prompt.md and follow the instructions.
```

## Manual install

```
npm install -g agent-browser && agent-browser install
git clone https://github.com/heimann/spectral.git
cd spectral && bun install
```

Requires: [Bun](https://bun.sh), `ANTHROPIC_API_KEY` env var.

## CLI

```
spectral run <spec.yml> [spec2.yml ...]   # run tests
spectral run specs/*.yml --quiet          # minimal output
spectral run specs/*.yml --json           # JSON output
spectral run specs/*.yml --cost           # show API cost
spectral run specs/*.yml --debug          # show agent steps
```
