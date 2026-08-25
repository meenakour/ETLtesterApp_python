# ETLtesterApp (Python backend) — ETL Test Case Generator

> This is a fork of [meenakour/ETLtesterApp](https://github.com/meenakour/ETLtesterApp) with the
> optional AI Assist backend re-implemented in Python (FastAPI) instead of Node/Express. All
> frontend logic — every heuristic, generator, and test — is identical and untouched; only
> `server/` differs. The two backends are wire-compatible: the frontend's fetch calls work against
> either one unchanged.

A client-side React app that turns an ETL/data-mapping document (Excel) into a full set of
Databricks/Spark SQL test cases, complete with priorities (P1/P2/P3), a Requirements
Traceability Matrix (RTM), and one-click exports to Excel, a `.sql` bundle, or a Jupyter
`.ipynb` notebook.

The core app runs entirely in the browser — no backend, no server, nothing ever leaves your
machine. There is one optional exception: **AI Assist** (off by default) can translate
transformation rules the deterministic classifier can't confidently parse, via a small backend of
its own — see [`server/README.md`](server/README.md) and the "AI Assist" section below.

**New to the app?** See `USER_GUIDE.md` for a full step-by-step walkthrough.
**Working on the code?** See `DEVELOPER_GUIDE.md` for architecture and internals.

## What it does

1. **Upload** an Excel mapping document: one sheet with source/target fields, tables, schemas,
   datatypes, transformations, and PK/nullable flags; a second sheet with join and filter
   conditions. Column headers are matched fuzzily (with a manual override UI), so it tolerates
   real-world naming inconsistencies.
2. **Preview & confirm** the detected columns and how join/filter rows associate to each table.
3. **Pick test categories** to generate:
   - Row count reconciliation
   - Schema & datatype validation
   - PK / Null / Uniqueness (plus a Critical Data Element safety net when no PK is declared)
   - Transformation & value validation
   - Datatype-driven edge cases
   - Data quality checks (email/phone/id-format heuristics, duplicate detection, referential
     integrity)
   - Business rule validation (parses free-text transformation rules into SQL, or flags for
     manual review rather than guessing)
   - Negative tests for percentages/ratios and aggregations (division-by-zero, out-of-range
     values, NULL-handling, join fan-out risk)
4. **Browse results**: every test case has a name, description, steps, expected result, a
   priority, and a ready-to-run Spark SQL query. A separate Traceability Matrix view shows
   which mapping requirements are covered and flags any gaps.
5. **Export**: full Excel workbook (Test Cases / Summary / Manual Review / RTM sheets), a plain
   `.sql` bundle, or a `.ipynb` notebook (one cell per test case, `%sql`-tagged for direct import
   into Databricks).

## Getting started

Requires [Node.js](https://nodejs.org/) (LTS).

```bash
npm install
npm run dev
```

Then open the printed `http://localhost:5173` URL in your browser.

On Windows, you can instead just double-click **`start-app.bat`** — it locates Node.js, installs
dependencies if `node_modules` isn't already present, and starts the dev server for you.

## AI Assist (optional)

Off by default. When enabled (via the "AI Assist" menu in the header), rows that fall to **Manual
Review** — because the deterministic classifier couldn't confidently translate the transformation
rule into SQL — get a second, best-effort attempt via a small backend that calls Anthropic's API
with a shared key. Only the transformation rule's text and column names are sent, never actual
data rows or values, and any accepted suggestion is flagged distinctly ("AI-Suggested") since it
still needs a tester's review. See [`server/README.md`](server/README.md) for setup.

## Tech stack

Vite + React + TypeScript + Tailwind CSS v4, with `xlsx` (SheetJS) for all spreadsheet
parsing/generation and `lucide-react` for icons. No backend, no external state library — except
for the small optional Python/FastAPI server behind AI Assist (see above).
