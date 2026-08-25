# Python/FastAPI backend

This backend has two independent, both-optional features. Neither is required to use the main
app — the frontend's own in-browser TypeScript pipeline handles everything by default.

## 1. AI Assist

Holds a single shared Anthropic API key server-side so the browser never has to store or expose
it, and exposes one endpoint that translates a free-text transformation rule into a SQL
expression when the app's own deterministic classifier gives up (i.e. only for rows that would
otherwise be flagged **Manual Review**).

This is a behavioral port of the original [ETLtesterApp](https://github.com/meenakour/ETLtesterApp)'s
Node/Express backend — same route, same request/response shape, same validation, same system
prompt — so the frontend (`src/lib/llm/aiAssist.ts`) works against it completely unchanged,
whichever backend you point it at.

Needs `ANTHROPIC_API_KEY` configured (see Setup below); the route returns `503` if it isn't,
rather than the whole server refusing to start.

## 2. Test-case-generation engine (`engine/`)

A full Python/pandas re-implementation of the frontend's own pipeline — sheet detection, fuzzy
column matching, mapping/join-row construction, and all nine test-case generators — exposed as
`POST /api/generate-test-cases`. This is a faithful, line-for-line port: every heuristic, every
regression fix (compound multi-value cells, transitive join/filter scope, split-column joins
sheets, standalone filter sections, redundant leading keywords) carries over from the TypeScript
version, verified against the same real-world mapping document that originally surfaced those
bugs — the generated SQL is byte-for-byte identical to the frontend's own output.

Needs no API key at all. See `engine/pipeline.py` for the orchestration entry point and
`server/tests/` for the pytest suite (mirrors the frontend's Vitest regression tests).

**Request** (`multipart/form-data`):
- `file` — the mapping workbook (`.xlsx`)
- `selected_categories` — JSON array of category names, e.g. `["ROW_COUNT_RECONCILIATION", "DQ_CHECKS"]`
- `table_type_configs` — JSON object, target-table name → `TableTypeConfig` (camelCase: `sourceKind`, `targetKind`, `dashboardName`, `kpiName`, ...); defaults to `{}`
- `mapping_sheet_name` / `joins_sheet_name` — optional overrides; auto-detected if omitted

**Response**: `{ sheetNames, mappingSheetName, joinsSheetName, ambiguous, mappingRowCount, testCases: [...], rtm: [...] }` — `testCases` and `rtm` use the exact same field names as the frontend's own `TestCase`/`RtmEntry` types.

Not yet wired into the frontend UI (no toggle to route generation through this endpoint instead
of the in-browser pipeline) — currently callable directly via the API for anyone who wants
server-side generation today.

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

Edit `.env` and set `ANTHROPIC_API_KEY` if you want AI Assist (skip this if you only want the
generation engine). Then:

```bash
python main.py
```

(or `uvicorn main:app --host 0.0.0.0 --port 8787` directly). The server listens on
`http://localhost:8787` by default (override with `PORT` in `.env`).

Run the test suite with:

```bash
pytest
```

## What AI Assist does (and doesn't do)

- Receives: the transformation rule's raw text, the list of known column names for that table, and
  the target field name. **Never** receives actual data rows or values.
- Calls Anthropic's API with a narrow system prompt restricting the model to producing a single SQL
  expression built only from the given column names and a small whitelist of SQL functions/keywords
  — or `null` if it isn't confident.
- Returns that suggestion as plain JSON. It does **not** validate the suggestion itself — the
  browser re-validates the returned expression against the exact same known-field/keyword whitelist
  used everywhere else in the app before ever trusting it, and any accepted suggestion is flagged
  distinctly ("AI-Suggested") in the UI so a tester still reviews it.

## What the generation engine does (and doesn't do)

- Receives: the full mapping workbook file. Unlike AI Assist, this **does** mean your mapping
  document (table/column names, transformation rules, schemas) leaves the browser — there's no way
  around that for server-side generation. It never receives anything beyond what's in the workbook
  itself (no separate data samples).
- Runs the identical ingestion + generator logic as the frontend, using pandas for the actual
  spreadsheet reading. Produces the same `TestCase`/RTM JSON shape either way.

## Deploying for a team

If you want either feature available to more than one machine, host `server/` anywhere that can
run Python (a small VM, a container, a serverless function) and set `ALLOWED_ORIGIN` in `.env` to
your deployed frontend's origin instead of the default `*`. The `ANTHROPIC_API_KEY` never needs to
leave this server.
