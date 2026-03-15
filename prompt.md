# Spectral Setup

You are setting up spectral - an AI-powered e2e testing tool - in this repository.

Follow these steps in order. Be conversational with the human, explain what you're doing, and ask for input where indicated.

## Step 1: Install spectral

Check if the following are available:
- `bun` (run `bun --version`)
- `agent-browser` (run `agent-browser --version`)
- `ANTHROPIC_API_KEY` environment variable (check if set, do NOT print the value)

If bun is missing, tell the human to install it: `curl -fsSL https://bun.sh/install | bash`

If agent-browser is missing, install it:
```
npm install -g agent-browser
agent-browser install
```

Then clone and install spectral:
```
git clone https://github.com/heimann/spectral.git /tmp/spectral
cd /tmp/spectral && bun install
```

If ANTHROPIC_API_KEY is not set, tell the human they need to set it before running tests.

Verify the install works: `cd /tmp/spectral && bun run src/index.ts --help`

## Step 2: Write example specs

Look around the current repository. Figure out:
- What kind of app is this? (web app, API, static site, etc.)
- What framework? (Next.js, Rails, Phoenix, Django, etc.)
- What URL does it run on locally? (check config files, package.json scripts, etc.)
- What are the main user-facing pages/flows?

Based on what you find, suggest 2-3 example spec files with simple assertions the human can verify. Focus on things that are obviously true about the app - page titles, navigation elements, key UI components.

Write the specs to a `specs/` directory in the repo. Example format:

```yaml
suite: Homepage
target: http://localhost:3000

assertions:
  - Page displays the site name in the header
  - Navigation contains a link to the about page
  - Page loads without any visible error messages
```

Ask the human: "I've written these example specs based on what I see in the codebase. Want me to adjust any of these, or shall we try running them?"

If the app is running locally, offer to run the tests: `cd /tmp/spectral && bun run src/index.ts run /path/to/repo/specs/*.yml`

## Step 3: CI integration

Check if the repo has CI set up:
- `.github/workflows/` (GitHub Actions)
- `.gitlab-ci.yml` (GitLab CI)
- `Jenkinsfile`, `.circleci/`, etc.

If CI exists, ask the human: "I see you have CI set up. Want me to add spectral to your CI pipeline? It would run your e2e specs on every push/PR."

If they say yes, add a CI step. For GitHub Actions:

```yaml
- name: Install spectral
  run: |
    npm install -g agent-browser && agent-browser install
    git clone https://github.com/heimann/spectral.git /tmp/spectral
    cd /tmp/spectral && bun install

- name: Run e2e specs
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: cd /tmp/spectral && bun run src/index.ts run ${{ github.workspace }}/specs/*.yml
```

Remind them to add `ANTHROPIC_API_KEY` to their repository secrets.

If no CI exists, skip this step.

## Step 4: Teach the human

Explain to the human:

"spectral is now set up. Here's how it works:

**Writing specs:** Create YAML files in `specs/` with a suite name, target URL, and plain English assertions. Each assertion is verified by an AI agent that opens a real browser, looks at the page, and judges pass/fail.

**Running specs:** `cd /tmp/spectral && bun run src/index.ts run specs/*.yml`

**Useful flags:**
- `--quiet` for CI-friendly minimal output
- `--json` for machine-readable results
- `--cost` to see how much the API calls cost
- `--debug` to see what the agent is doing step by step

**Providing context:** If an assertion needs data (like login credentials), use the `with:` key:
```yaml
- Valid credentials redirect to /dashboard:
    with:
      email: test@example.com
      password: test123
```

**Tips:**
- Keep assertions simple and observable - things you can see on the page
- One spec file per page or flow
- Assertions run sequentially within a suite
- Each assertion costs a small amount of API usage (use `--cost` to track)"

Ask: "Any questions about how spectral works or what you can test with it?"

If they ask questions you can't answer from this prompt, read the spectral source code at `/tmp/spectral/src/` or run `cd /tmp/spectral && bun run src/index.ts --help` for CLI details.
