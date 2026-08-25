# User Guide — Getting Started

This guide walks you through using the ETL Test Case Generator, from your first upload to
exporting a finished test suite. No coding knowledge is required.

## What this tool does

You give it an Excel mapping document — the spreadsheet your team already maintains describing
how source fields map to target fields during an ETL/data load — and it generates a full set of
ready-to-run SQL test cases (Databricks / Spark SQL) covering row counts, schema, data quality,
business rules, and more, along with an export in whichever format you need (Excel, `.sql`,
Databricks notebook, or Azure DevOps import CSV).

**Everything runs in your browser.** Your mapping document is never uploaded to a server —
nothing leaves your machine.

## Before you start: what your mapping document needs

The app expects an Excel workbook (`.xlsx` or `.xls`) with:

1. **A mapping sheet** — one row per source-to-target field pairing, with columns for things like
   source/target table, source/target field, source/target datatype, transformation logic, and
   primary key / nullable flags.
2. **A joins & filters sheet** (optional, but recommended) — documents any joins or WHERE-clause
   filters that apply when moving data from source to target, so row-count and referential
   checks can account for them correctly.

You don't need to match any exact column-header wording — the app fuzzy-matches common
real-world naming variants (e.g. "Target Field", "Tgt Field", and "Target Column Name" all match
the same thing), and lets you manually fix any column it gets wrong or can't find.

**Don't have a mapping doc handy?** Click **"Download a sample template"** on the upload screen
to get a two-sheet example workbook showing the expected shape.

## Step 1 — Upload

Drag and drop your workbook onto the upload area, or click it to browse. The app will:

- Parse the workbook and automatically figure out which sheet is your mapping sheet and which is
  your joins & filters sheet.
- If it can't tell confidently (e.g. more than two sheets, or two sheets that look similarly
  structured), you'll be asked to pick manually on the next screen.

## Step 2 — Preview & Map Columns

This screen has three tabs:

### Mapping Sheet tab
Shows a preview of your data plus a table of every field the app is looking for (Source Field,
Target Table, Datatype, PK, Nullable, etc.), what column it matched to your sheet, and a
confidence badge:
- **Auto-detected** — high confidence, no action needed.
- **Tentative** — a plausible match; worth a quick glance.
- **Low confidence** / **Unmatched** — double-check or manually pick the right column using the
  dropdown in the Override column.

Fields marked with `*` are required — you can't continue until every required field is mapped to
something.

### Joins & Filters Sheet tab
Same idea, plus a summary of which joins/filters were associated with which target table. If a
table name appears to be documented under more than one schema, you'll see a warning — worth
checking your joins sheet for a naming collision.

### Source/Target Type tab
By default, every table is treated as a normal database table on both the source and target side.
Change this here if your scenario is different:

- **Source Type → File**: use this when your source is a flat file (CSV/Parquet/JSON/Delta) at a
  landing layer, not a queryable table. If your mapping doc has "Source File Location"/"Source
  File Name" columns, the file path is detected automatically; otherwise you can type it in along
  with the file format.
- **Target Type → File**: same idea, for a file-based target.
- **Target Type → Dashboard**: use this when the "target" isn't a table at all — it's a KPI shown
  on a BI dashboard (e.g. Power BI, Tableau). Enter the Dashboard Name and KPI Name; the generated
  test case will compute the underlying metric via SQL and walk you through comparing it to the
  dashboard by hand.

Test cases adapt automatically based on what you select here — you don't need to change anything
if your setup is a standard table-to-table load.

## Step 3 — Select Test Case Categories

Choose which categories of tests to generate. Each card shows a plain-English description and an
estimated test-case count. You can **Select All**, **Select None**, or pick individually:

| Category | What it covers |
|---|---|
| Row Count Reconciliation | Source vs. target row counts match (accounting for joins/filters) |
| Schema & Datatype Validation | Target column types/nullability match what the mapping doc declares |
| PK / Null / Uniqueness | Primary key uniqueness, NOT NULL enforcement |
| Transformation & Value Validation | Transformation logic produces the correct target value |
| Datatype Boundary Validation | Boundary conditions: whitespace, overflow, negative values, invalid dates, etc. |
| Data Quality Checks | Email/phone/date format checks, duplicate detection, referential integrity |
| Business Rule Validation | Free-text business rules translated into SQL (or flagged for manual review) |
| Negative Tests (Datatype-driven) | Division-by-zero, out-of-range percentages, NULL handling in aggregations |
| Dashboard KPI Validation | Only appears if you set a target to "Dashboard" in Step 2 |

Click **Generate** to produce the test suite.

## Step 4 — Results & Export

### Browsing test cases
- Use the search box, category filter, priority filter, and the three checkboxes (**Manual
  review only**, **CDE only**, **Dashboard comparison only**) to narrow the list.
- Results are paginated 10 per page.
- Click any row to open a detail panel with the full description, numbered steps, expected
  result, and the ready-to-run SQL query.

### Understanding the badges
- **CDE** — this test case involves a *Critical Data Element*: a field your data team would
  typically treat as high-importance (an identifier, a financial amount, a status flag, etc.),
  flagged especially when your mapping doc didn't declare a formal primary key for that table.
- **Manual Review** — the transformation/business rule text was too ambiguous to safely translate
  into SQL automatically. The test case still gets generated with full context (the raw rule
  text, source/target tables), but a tester needs to write the actual validation query by hand.
- **Dashboard Comparison** — this test computes a value via SQL, but the "target" is a BI
  dashboard tile, not a table — you'll need to manually compare the computed number to what's
  shown on the dashboard.
- **AI-Suggested** — a Manual Review case that the optional AI Assist feature (see below)
  successfully translated into SQL. Still worth a closer look before trusting it, like any
  AI-generated suggestion.

Hover any badge for a short explanation.

### AI Assist (optional, off by default)
Some transformation rules are written as plain prose ("map status A to Active, I to Inactive")
rather than SQL-like syntax, so the deterministic classifier can't safely translate them and
generates a **Manual Review** case instead. AI Assist gives those a second, best-effort pass:

1. Click **AI Assist** in the header and turn it on. Point **Server URL** at wherever your team is
   running the small backend described in `server/README.md` (defaults to
   `http://localhost:8787`), and use **Test connection** to confirm it's reachable.
2. Back in Results, a button appears: **Enhance N Manual Review cases with AI**. Click it to run
   every eligible case through the AI Assist server.
3. Any case the AI could confidently translate flips from **Manual Review** to a real SQL query,
   tagged **AI-Suggested**. Anything it couldn't confidently translate is left exactly as it was.

Only the transformation rule's text and the list of column names are sent to the AI Assist server
— never your actual data rows or values — and this only happens for rows you've explicitly asked
to enhance, never automatically.

### Traceability Matrix (RTM)
Switch to the **Traceability Matrix** tab to see one row per field mapping from your document,
with a "Covered By" column listing which test case(s) verify it. Anything with zero covering test
cases is flagged as a **Gap** — check the "Gaps only" box to see just those. This is the fastest
way to answer "did I miss testing anything from my mapping doc?"

### Exporting
Click **Export** for four options:

- **SQL Bundle** (`.sql`) — a plain text file with every test case's SQL, one after another.
  Good for pasting into a SQL editor.
- **Notebook (`.ipynb`)** — a genuine Jupyter notebook, one cell per test case, ready to import
  directly into Databricks. Each cell is tagged `%sql` so it runs correctly even in a
  Python-kernel notebook.
- **CSV (Azure DevOps)** — opens a form first asking for your org's Area Path, Iteration Path,
  and a few other fields (assigned-to, EAI codes, tools used, automation status, state) that
  can't be inferred from a mapping document. Fill these in once and they're stamped onto every
  row of the CSV — you won't need to fill them in by hand after import. The work-item ID column
  is left blank on purpose; Azure DevOps assigns real IDs on import.
- **Excel** — a full workbook with four sheets: **Test Cases** (every test case, one row per
  step — common fields like ID/name/SQL only appear on each case's first row, not repeated on
  every step row), **Summary** (counts by category and priority), **Manual Review** (just the
  cases needing manual translation, if any), and **RTM**.

## Tips & Troubleshooting

- **"Please resolve all required fields" won't let me continue** — go back to the Mapping Sheet
  tab and check every field marked `*` has a column assigned in the Override dropdown.
- **A column I expect isn't being picked up** — the fuzzy matcher looks at header wording, not
  position. If your header is unusual, just pick it manually from the Override dropdown; there's
  no wrong answer here, your choice always wins.
- **Test case count looks low for a table** — some categories intentionally skip certain fields
  (system/audit columns like `etl_timestamp`, `load_date`, `batch_id`, or `data_quality_check`
  are deliberately excluded from per-field checks, since they're pipeline-populated, not mapped
  business data) or skip entirely for dashboard-targeted tables (most per-row checks don't apply
  to a KPI tile).
- **A transformation rule generated a "Manual Review" case instead of real SQL** — this means the
  rule's wording was ambiguous enough that the app chose not to guess rather than risk generating
  incorrect SQL. The full original rule text is preserved in the test case description so a
  tester can translate it correctly by hand.
- **Starting over** — click **Start Over** in the header at any point to reset and upload a
  different file.
- **Light/dark mode** — toggle via the sun/moon icon in the header; your preference is remembered
  next time you open the app.

## Running the app

See `README.md` for install/run instructions, including the no-command-line `start-app.bat`
option for Windows machines.
