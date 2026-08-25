# AI Assist server (optional, Python/FastAPI)

A small backend used only by the app's optional **AI Assist** feature. It holds a single shared
Anthropic API key server-side so the browser never has to store or expose it, and exposes one
endpoint that translates a free-text transformation rule into a SQL expression when the app's own
deterministic classifier gives up (i.e. only for rows that would otherwise be flagged **Manual
Review**).

This is a behavioral port of the original [ETLtesterApp](https://github.com/meenakour/ETLtesterApp)'s
Node/Express backend — same two routes, same request/response shapes, same validation, same
system prompt — so the frontend (`src/lib/llm/aiAssist.ts`) works against it completely
unchanged, whichever backend you point it at.

The main app works completely fine without this server. It's only needed if you turn on **AI
Assist** in the app's header menu.

## Setup

Requires Python 3.10+.

```bash
cd server
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and set `ANTHROPIC_API_KEY` to a real key. Then:

```bash
python main.py
```

(or `uvicorn main:app --host 0.0.0.0 --port 8787` directly). The server listens on
`http://localhost:8787` by default (override with `PORT` in `.env`). Point the app's **AI Assist →
Server URL** field at wherever this ends up running.

## What it does (and doesn't do)

- Receives: the transformation rule's raw text, the list of known column names for that table, and
  the target field name. **Never** receives actual data rows or values.
- Calls Anthropic's API with a narrow system prompt restricting the model to producing a single SQL
  expression built only from the given column names and a small whitelist of SQL functions/keywords
  — or `null` if it isn't confident.
- Returns that suggestion as plain JSON. It does **not** validate the suggestion itself — the
  browser re-validates the returned expression against the exact same known-field/keyword whitelist
  used everywhere else in the app before ever trusting it, and any accepted suggestion is flagged
  distinctly ("AI-Suggested") in the UI so a tester still reviews it.

## Deploying for a team

If you want this available to more than one machine, host `server/` anywhere that can run Python
(a small VM, a container, a serverless function) and set `ALLOWED_ORIGIN` in `.env` to your
deployed frontend's origin instead of the default `*`. The `ANTHROPIC_API_KEY` never needs to
leave this server.
