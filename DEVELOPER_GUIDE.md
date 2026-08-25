# Developer Guide — ETL Test Case Generator

This document explains how the codebase is put together: the data flow from an uploaded
spreadsheet to generated test cases, every module's responsibility, and the heuristics that
drive the "intelligent" parts of the app (column matching, transformation classification,
Critical Data Element detection, etc). It assumes you already have `README.md`'s quick-start
running.

For a user-facing walkthrough of the app itself, see `USER_GUIDE.md`.

## 1. Philosophy

- **Fully client-side.** No backend, no network calls, no server-side state. Everything from
  parsing the Excel file to generating SQL to writing the export files happens in the browser.
  This was a deliberate choice so the tool can run inside restricted corporate environments
  (see `start-app.bat` and the `offline-bundle` branch) and so uploaded mapping documents —
  which often contain internal schema/table names — never leave the user's machine.
- **Stateless per session.** There is no persistence layer (no localStorage for app data, no
  IndexedDB). Refreshing the page or clicking "Start Over" resets everything. The only thing
  persisted across reloads is the light/dark theme preference (`localStorage`, see
  `src/state/ThemeContext.tsx`).
- **Never guess silently.** Anywhere the app has to interpret free text (a transformation rule,
  a column header, a file format) it either produces a confident, correct answer or explicitly
  flags the result as needing human review (`MANUAL_REVIEW` strategy, low-confidence column
  badges, etc). It deliberately avoids emitting SQL that *looks* plausible but is actually wrong.

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript, built with Vite |
| Styling | Tailwind CSS v4 (`@custom-variant dark` + a `.dark` class toggle, not media-query-only) |
| Spreadsheet I/O | [`xlsx`](https://www.npmjs.com/package/xlsx) (SheetJS) — both parsing uploads and writing every export format |
| Icons | `lucide-react` |
| State management | React Context + `useReducer` — no Redux/Zustand/etc, the app's state shape is simple enough not to need one |
| Testing | Vitest (`npm test` / `npm run test:watch`), configured in `vite.config.ts`'s `test` field |
| Path aliases | `@/*` → `src/*` (see `vite.config.ts` / `tsconfig.json`) |

No backend framework, no ORM, no API layer — there is nothing on the server side to document.

## 3. Project Structure

```
src/
  types/            Plain data-shape definitions (no logic)
  lib/               Pure functions: parsing, heuristics, SQL building, exporters
    excel/           Workbook parsing, sheet/column detection, mapping-row construction, exporters
    generators/      One file per test category, plus shared heuristics
    sql/             SQL identifier quoting and FROM-clause resolution helpers
    llm/             Client for the optional AI Assist backend (§10) -- fetch wrapper + enrichment orchestration
  hooks/             Thin hooks bridging React state to the pure `lib/` functions
  state/             App-wide React Context providers (AppStateContext, ThemeContext, AiAssistContext)
  components/        Presentational + step-orchestrating React components, grouped by app step
  App.tsx            Top-level provider wiring + step router
  main.tsx           Vite/React entry point
server/              Standalone Python/FastAPI app (own venv/requirements.txt) for AI Assist (§10)
                     -- not required to run the main app, only needed if that feature is enabled
```

The rule of thumb: **everything in `lib/` is a pure, framework-free function you can unit test
in isolation** (and every non-trivial one has a `*.test.ts` sibling). `components/` and `hooks/`
are the only places that touch React state.

## 4. Application Flow

The app is a single-page, four-step wizard. The current step lives in `AppState.step`
(`'upload' | 'preview' | 'categories' | 'results'`), and `App.tsx`'s `StepRouter` renders the
matching component:

```
UploadStep → PreviewStep → CategorySelectionStep → ResultsStep
```

All state for the whole session lives in one `AppStateContext` (`src/state/AppStateContext.tsx`),
implemented as a single `useReducer` reducer over an `AppState` object — there's no per-step
local state duplicated elsewhere except UI-only concerns (search text, which accordion is open,
etc), which live as `useState` inside the relevant step component.

### 4.1 State shape (`AppState`)

```ts
interface AppState {
  step: Step;
  fileName: string | null;
  workbookSheetNames: string[];
  mappingSheetName: string | null;
  joinsSheetName: string | null;
  mappingSheet: SheetData | null;
  joinsSheet: SheetData | null;
  mappingColumns: DetectedColumn<MappingFieldKey>[];
  joinColumns: DetectedColumn<JoinFieldKey>[];
  sheetChoiceNeeded: boolean;
  selectedCategories: TestCategory[];
  testCases: TestCase[];
  error: string | null;
  isLoading: boolean;
  tableTypeConfigs: Record<string, TableTypeConfig>;
}
```

Key actions (see the `reducer` function for the full list):

- `LOAD_WORKBOOK` — fired once a file is parsed and sheets are auto-classified; resets
  everything else back to defaults (`{ ...initialAppState, step: 'preview', ...payload }`) so a
  second upload can't leak state from the first.
- `OVERRIDE_MAPPING_COLUMN` / `OVERRIDE_JOIN_COLUMN` — user manually re-points a field to a
  different header in the Preview step's column mapping table.
- `SET_TABLE_TYPE_CONFIG` — merges a partial `TableTypeConfig` patch onto whatever's already
  stored for that target table (defaults to `DEFAULT_TABLE_TYPE_CONFIG` if none yet).
- `SET_TEST_CASES` — also advances `step` to `'results'` in the same dispatch.

### 4.2 The raw workbook itself

The parsed `XLSX.WorkBook` object is **not** stored in React state (it's not serializable-friendly
and isn't needed after initial classification) — it's kept in a `useRef` inside
`AppStateProvider` (`workbookRef`), used only when the user manually re-picks which sheet is the
mapping sheet vs. the joins sheet (`selectMappingSheet` / `selectJoinsSheet` re-extract sheet data
from the ref without re-parsing the file).

## 5. Data Model

Defined in `src/types/`, no logic, just shapes:

- **`mapping.ts`** — `MappingRow` (one row per source→target field pairing, after column
  detection has resolved which spreadsheet column means what), `JoinFilterRow`, `SheetData`
  (raw headers + rows straight from `xlsx`, before field-level interpretation).
- **`columnMapping.ts`** — `MappingFieldKey`/`JoinFieldKey` (the canonical field names the app
  understands, e.g. `sourceField`, `targetDatatype`), their human labels, which are `REQUIRED_*`,
  and `DetectedColumn<K>` (the result of fuzzy-matching one field key against the sheet's actual
  headers: `{ field, matchedHeader, confidence, inverted }`).
- **`tableTypeConfig.ts`** — `TableTypeConfig` (per-target-table L1/L2/L3 shape selection —
  see §7), plus `getTableTypeConfig()`, the single place that resolves "no config yet" to sane
  defaults so callers never need to special-case a missing entry.
- **`testCase.ts`** — `TestCase` (the generated output unit) and every category-keyed constant
  (`TEST_CATEGORIES`, `CATEGORY_LABELS`, `CATEGORY_DESCRIPTIONS`, `CATEGORY_PREFIX`,
  `CATEGORY_DEFAULT_PRIORITY`) plus `Priority`/`PRIORITY_LABELS`. Adding a 10th test category
  means extending every one of these records — TypeScript will refuse to compile until you do,
  since they're all `Record<TestCategory, X>`.

`MappingRow.id` deserves a note: it's not a spreadsheet row number. A single physical Excel row
can expand into **multiple** `MappingRow`s when its source/target field cell contains an
Alt+Enter line break (two field names stacked in one cell — see §6.3), so IDs are
`map-{rowIndex}` or `map-{rowIndex}-{lineIndex}` when split. Every generator threads
`sourceMappingRowIds` through to its output `TestCase`s specifically so the RTM (§9) can trace
coverage back to the exact `MappingRow`, not just the spreadsheet line.

## 6. Excel Ingestion Pipeline

Upload → test-case-ready data goes through these stages, in order:

```
File
 → parseWorkbookFromFile()          [parseWorkbook.ts]      raw XLSX.WorkBook
 → classifySheets()                 [sheetDetection.ts]     which sheet is "Mapping", which is "Joins & Filters"
 → extractSheetData() × 2           [sheetDetection.ts]      {headers, rows} per sheet, header row auto-located
 → detectColumns() × 2               [columnDetection.ts]    per-field DetectedColumn[] (fuzzy header matching)
 → buildMappingRows()                [buildMappingRows.ts]   SheetData + DetectedColumn[] → MappingRow[]
 → buildJoinFilterRows()             [buildJoinFilterRows.ts] SheetData + DetectedColumn[] → JoinFilterRow[]
 → buildJoinIndex()                  [associateJoins.ts]     JoinFilterRow[] → per-table join lookup maps
 → groupMappingRowsByTargetTable()   [associateJoins.ts]     MappingRow[] → Map<targetTable, MappingRow[]>
```

The last four all run inside `useMappingData()` (`src/hooks/useMappingData.ts`), memoized on the
relevant slices of `AppState`, and are combined into the `GeneratorContext` that every test
generator receives.

### 6.1 Sheet auto-classification (`sheetDetection.ts`)

Given a workbook with an unknown number of sheets, `classifySheets()` scores every sheet's
header row against two alias pools (all known mapping-field aliases vs. all known join-field
aliases — see §6.2) and assigns the highest-scoring sheet as "Mapping" and the highest remaining
one as "Joins & Filters". If the winning margin is too thin (`< 15%` of the leader's score) or
there are more than 2 sheets, `sheetChoiceNeeded` is set and the Preview step shows a manual
sheet picker instead of guessing.

Within a chosen sheet, `extractSheetData()` doesn't assume row 1 is the header — it scans up to
the first 10 rows (`findHeaderRowIndex`), scoring each by non-empty-cell density plus alias hits,
and picks whichever row looks most like a real header. This tolerates title rows, merged banner
cells, or blank rows above the real table that are common in hand-maintained mapping docs.

### 6.2 Fuzzy column matching (`fuzzyMatch.ts` + `columnDetection.ts` + `aliases.ts`)

Every field the app cares about (`sourceField`, `targetDatatype`, `primaryKeyFlag`, ...) has a
curated list of known real-world header spellings in `MAPPING_FIELD_ALIASES` /
`JOIN_FIELD_ALIASES` (`src/lib/excel/aliases.ts`) — e.g. `targetDatatype` matches "target
datatype", "tgt datatype", "target data type", "datatype", etc. `nullableFlag` additionally has
`inverseAliases` (`mandatory`, `required`, `not null`) — if the sheet only has a "Mandatory"
column, the app matches it but flags `inverted: true` so the boolean gets flipped when read.

`headerAliasScore()` (`fuzzyMatch.ts`) blends four signals into a single similarity score:
- 60% **Dice coefficient** over character bigrams (tolerant of small spelling differences),
- 30% **normalized Levenshtein distance** (tolerant of typos/abbreviations),
- +0.15 bonus if one string literally contains the other as a substring,
- +0.10 bonus if every token in the alias also appears somewhere in the header.

`detectColumns()` then does a **greedy global assignment**: it scores every (field, header) pair,
then repeatedly assigns the single highest-scoring remaining pair until every field has either a
match or has exhausted its candidates — critically, **no header can be assigned to two different
fields**, even if it happens to score well against both. Confidence bands
(`CONFIDENCE_AUTO_ACCEPT = 0.8`, `CONFIDENCE_TENTATIVE = 0.5`) drive the badge shown in
`ColumnConfidenceBadge.tsx` ("Auto-detected" / "Tentative" / "Low confidence" / "Unmatched") and
whether a field is silently trusted vs. flagged for the user to eyeball. The user can always
override any assignment via the dropdown in `ColumnMappingPanel.tsx`, which dispatches
`OVERRIDE_MAPPING_COLUMN`/`OVERRIDE_JOIN_COLUMN` and forces `confidence` to `1`.

### 6.3 Building `MappingRow`s (`buildMappingRows.ts`)

Two behaviors worth knowing about:

1. **Multi-line cell splitting.** If a source or target field cell contains an embedded newline
   (someone Alt+Entered two field names into one cell), `buildMappingRows` splits it into
   separate `MappingRow`s via `.flatMap()` — one Excel row becomes N logical mapping rows. Every
   *other* field (schema, table, transformation, datatype flags) is instead **whitespace-collapsed**
   (`getValue()`), not split — those are expected to be single values, and stray newlines there
   are just formatting noise to clean up, not a multi-value signal.
2. **Boolean parsing.** `PK`/`Nullable`-style flags accept a generous truthy set (`y`, `yes`,
   `true`, `1`, `x`, `pk` — case-insensitive) via `parseBoolean()`. If a column truly isn't
   present in the sheet at all, `isPrimaryKey` defaults to `false` and `isNullable` defaults to
   `true` (the safer default — the app won't invent a false NOT NULL constraint it doesn't have
   evidence for).

### 6.4 Join/filter association (`associateJoins.ts`)

`buildJoinIndex()` builds two lookup maps from the joins sheet, keyed by normalized table name
(`normalizeTableName()` — lowercases and strips schema qualifiers/whitespace so `Orders` and
`orders` and `dbo.Orders` all key the same):

- `primaryJoinsByTable` — only rows where the sheet's own "Table" column names this table. Used
  whenever a query is being built *for* that table specifically (e.g. the row-count generator's
  source-side filter), so a join documented against table A never leaks into table B's query.
- `joinsByTable` — the above, **plus** any row where this table merely appears in the
  "Tables Involved" list. Used for the human-readable association summary
  (`JoinAssociationSummary.tsx`) and referential-integrity checks, where "this table participates
  in this join somehow" is the relevant question, not "this join is primarily about this table."

It also flags `ambiguousTables` — table names that appear as a primary join target under more
than one distinct schema value, surfaced as a warning banner in the Preview step, since it means
the joins sheet may be describing two different physical tables that happen to share a name.

## 7. Source/Target Kinds — L1 / L2 / L3 Support

By default every target table is assumed to be a normal database table fed by another database
table (an "L2" ETL hop). Two other real-world shapes are supported, selected **per target table**
in the Preview step's "Source/Target Type" tab (`TableTypeConfigPanel.tsx`):

| | Source | Target |
|---|---|---|
| Normal (default) | `table` | `table` |
| L1 — landing layer | `file` | `table` (or `file`) |
| L3 — presentation layer | `table`/`file` | `dashboard` |

This is modeled by `TableTypeConfig` (`src/types/tableTypeConfig.ts`), stored in
`AppState.tableTypeConfigs: Record<targetTable, TableTypeConfig>` and threaded into every
generator via `GeneratorContext.tableTypeConfigs`. `getTableTypeConfig(configs, table)` resolves
missing entries to `DEFAULT_TABLE_TYPE_CONFIG` (`{ sourceKind: 'table', targetKind: 'table' }`),
so existing mapping docs behave exactly as before unless a user explicitly opts a table into a
different shape.

**File resolution** (`src/lib/fileFormat.ts` + `src/lib/sql/sourceReference.ts`):
- `inferFileFormat(fileName)` maps an extension (`.csv`/`.parquet`/`.json`/`.delta`, plus a few
  synonyms like `.tsv`/`.pq`/`.jsonl`) to a `FileFormat`, or `null` if unrecognized.
- `buildFilePath(location, fileName)` joins the mapping doc's `Source File Location` +
  `Source File Name` columns (if present) into one path, tolerating a missing trailing separator.
- `resolveSourceReference(config, rows, schema, table)` / `resolveTargetReference(...)` are what
  every generator calls instead of `qualifiedTable()` directly: when the relevant `*Kind` is
  `'file'`, it auto-detects the path/format from the row data first, falls back to the manual
  override collected in `TableTypeConfigPanel`, and produces a Spark file-qualified reference
  like `` csv.`/mnt/landing/customers.csv` `` — otherwise it produces the normal
  `` `schema`.`table` `` reference.

**Generator-level behavior differences** — every generator that builds a FROM clause checks
`typeConfig.targetKind`/`sourceKind` and either adapts or skips the table group entirely:
- `targetKind === 'dashboard'` → `rowCountGenerator`, `schemaValidationGenerator`,
  `pkNullUniquenessGenerator`, `edgeCaseGenerator`, `dqChecksGenerator`,
  `transformationValidationGenerator`, `businessRuleGenerator`, `negativeCalculationGenerator`
  all skip that table group entirely (none of those checks mean anything against a BI tile).
  Instead, **`dashboardKpiGenerator`** is the *only* generator that fires for dashboard targets.
- `sourceKind === 'file'` → row-count generator switches to a plain
  `SELECT COUNT(*) FROM csv.\`path\`` with no join/filter attachment (joins across a raw file
  aren't modeled); referential-integrity checks in `dqChecksGenerator` are skipped entirely
  unless both sides are `'table'`.

**`dashboardKpiGenerator.ts`** is worth reading in full since it's the odd one out: it builds a
`SELECT` from the source side, translating each row's transformation into a qualified expression
via `classifyTransformation(..., { allowAggregates: true })` — this is the **only** place
`allowAggregates` is ever `true` (see §8.5), because a dashboard KPI genuinely is a single
aggregate value across the whole table, unlike every other generator's per-row correlated
comparisons. Every generated case is stamped `isDashboardComparison: true` and framed explicitly
as "run this query, then go compare the number to the dashboard tile by hand" — it does not
pretend to be fully automatable.

## 8. Test Case Generation Engine

### 8.1 The generator contract

```ts
interface GeneratorContext {
  mappingRowsByTargetTable: Map<string, MappingRow[]>;
  joinIndex: JoinAssociation;
  allMappingRows: MappingRow[];
  tableTypeConfigs: Record<string, TableTypeConfig>;
}
type GeneratorFn = (ctx: GeneratorContext) => TestCase[];
```

`src/lib/generators/index.ts` holds `GENERATORS: Record<TestCategory, GeneratorFn>` — the single
place new categories get registered — and `runGenerators(selected, ctx)`, which flat-maps the
user's selected categories through their generators and pipes the result through
`assignSequentialIds()`.

Every generator follows the same shape: `for (const [targetTable, rows] of
ctx.mappingRowsByTargetTable)`, resolve that table's `TableTypeConfig`, skip if not applicable,
then either emit one `TestCase` per table or one per row depending on the category. IDs are
assigned by `nextDraftId()` (a simple incrementing counter, `draft-1`, `draft-2`, ...) during
generation and then **replaced** by `assignSequentialIds()` afterward, which sorts all generated
cases by category order → target table → name, then renumbers them per-category as
`TC-{prefix}-{003-padded}` (e.g. `TC-RC-001`, `TC-DQ-014`) using `CATEGORY_PREFIX`. This two-pass
approach means individual generators never need to know about each other's output counts to avoid
ID collisions.

### 8.2 The nine categories

| Category | Generator file | What it checks | Skips when |
|---|---|---|---|
| Row Count Reconciliation | `rowCountGenerator.ts` | Source vs. target row counts, honoring documented joins/filters (source-side only, scoped via `primaryJoinsForTable`) | target is a dashboard |
| Schema & Datatype Validation | `schemaValidationGenerator.ts` | `information_schema.columns` (with a `DESCRIBE TABLE` fallback noted in the SQL comment) against declared datatype/nullability | target isn't a plain table |
| PK / Null / Uniqueness | `pkNullUniquenessGenerator.ts` | PK duplicate check, NOT NULL checks per non-nullable field, **and** a CDE safety-net not-null check for nullable-but-critical fields | target isn't a plain table |
| Transformation & Value Validation | `transformationValidationGenerator.ts` | Re-derives the target value from source + transformation rule via `classifyTransformation`, for value-producing strategies (concat, direct SQL function, arithmetic, default/lookup) | trivial/direct-copy rows, dashboard targets, ETL system fields |
| Datatype Boundary Validation | `edgeCaseGenerator.ts` | Whitespace-only strings, empty-vs-NULL, length overflow (string); negative/zero/precision overflow (numeric); NULL/future/sentinel dates; domain-value checks (boolean) | dashboard targets, ETL system fields, unknown datatype |
| Data Quality Checks | `dqChecksGenerator.ts` | Email/phone/date-format heuristics, `_id`/`_key` duplicate detection, whole-row duplicate check when no PK exists, a CDE uniqueness safety net, referential integrity (LEFT JOIN orphan check) | dashboard targets, ETL system fields (per-field checks); referential integrity also requires both sides to be plain tables |
| Business Rule Validation | `businessRuleGenerator.ts` | Parses free-text rules into `CASE`/`MANUAL_REVIEW` SQL | dashboard targets, ETL system fields, non-CASE-like strategies |
| Negative Tests (Datatype-driven) | `negativeCalculationGenerator.ts` | Division-by-zero, out-of-range percentage/ratio, NULL-handling in aggregations, join fan-out risk | dashboard targets |
| Dashboard KPI Validation | `dashboardKpiGenerator.ts` | Computes the metric via SQL, frames an explicit manual comparison to a named dashboard/KPI | only fires *for* dashboard targets — the inverse of every other generator |

Default priorities (`CATEGORY_DEFAULT_PRIORITY`, individually overridden per case in some
generators — e.g. a manual-review business rule is P1, a routine one is P2):

- **P1**: Row Count, Schema/Datatype, PK/Null/Uniqueness, Dashboard KPI, plus specific P1
  escalations (referential integrity, division-by-zero, join fan-out, CDE not-null enforcement).
- **P2**: Transformation Validation, DQ Checks, Business Rule (non-manual-review), Negative Tests.
- **P3**: Datatype Boundary Validation.

### 8.3 Critical Data Elements (`cde.ts`)

CDE detection is a cross-cutting, name-heuristic concept — separate from the mapping doc's
formal PK flag — used to fill the coverage gap that appears when a table has *no* declared
primary key:

- `isCdeIdentifier(name)` — identifier-shaped names (`id`, `*_id`, `*_key`, `*_number`, `ssn`,
  `account_number`) that are safe to assume *unique* even without a formal PK.
- `isCriticalDataElement(name)` — the above, **or** financial/status-shaped names (`amount`,
  `balance`, `price`, `total`, `status`, `flag`, `*_code`, etc) that are worth a not-null check
  even if not assumed unique. Note `_code` deliberately sits only in the "critical" list, not the
  "identifier" list — a `_code` suffix (`status_code`, `source_system_code`) is just as often a
  repeating classification value as a genuine unique key, so it's never used for a uniqueness
  check, only a not-null one.

Both guard against `isEtlSystemField()` first (see §8.4) — an ETL-infrastructure column
(`batch_id`, `etl_timestamp`) can *look* identifier-shaped by name but isn't a business CDE.

`dqChecksGenerator` uses `isCdeIdentifier` for its no-PK uniqueness safety net;
`pkNullUniquenessGenerator` uses `isCriticalDataElement` for its no-PK not-null safety net. Cases
produced this way are stamped `isCde: true` and surfaced with a dedicated badge + tooltip
(`badgeTooltips.ts`'s `CDE_TOOLTIP`).

⚠️ **Regex gotcha you will hit again if you add more CDE/keyword patterns**: an underscore is a
JavaScript regex "word character," so `\bword\b` silently fails to match `word` when it appears
after a literal underscore (`total_amount` never matches `/\bamount\b/`). Every pattern in
`cde.ts` and the negative-calculation generator's percent/ratio detection deliberately avoids
`\b` around snake_case-suffix keywords for exactly this reason — see the comments in both files
before "fixing" them back to `\b`.

### 8.4 ETL system field suppression (`etlSystemFields.ts`)

`isEtlSystemField(name)` flags pipeline-populated/audit columns that are not mapped business
data and therefore don't deserve per-field checks: `etl_*`/`*_etl`, `dw_*`, data-quality-check
fields (`data_quality_check`, `dq_check`, `dq_flag`, `dq_score`), `batch_id`/`run_id`/`job_id`,
`record_source`, and any `{action}_{time}` combination (`load_date`, `created_ts`,
`updated_timestamp`, etc, built from an `ACTION_WORDS × TIME_WORDS` cross product rather than an
exhaustive literal list, so it generalizes to reasonable name variants without needing every
combination spelled out).

This single predicate is checked at the top of the per-row loop in `edgeCaseGenerator`,
`dqChecksGenerator`, `transformationValidationGenerator`, and `businessRuleGenerator` (skip the
field entirely) and inside both `cde.ts` functions (never classify these as CDEs). Table-level
checks (row count, schema validation, whole-row duplicate check, PK uniqueness) are **not**
suppressed by this — those still cover the table as a whole; only the noisy *per-field* checks on
infrastructure columns are silenced.

### 8.5 Transformation classification (`businessRuleHeuristics.ts`)

`classifyTransformation(rawText, knownFields, { allowAggregates? })` is the deterministic engine
behind both `transformationValidationGenerator` and `businessRuleGenerator` (and,
with `allowAggregates: true`, `dashboardKpiGenerator`). It tries a fixed sequence of strategies
and returns the *first* one that both parses **and** passes a token-whitelist gate — never
falling through to a strategy match that contains an unrecognized token, since that would mean
silently emitting SQL built from a word the classifier doesn't actually understand:

1. `DIRECT_COPY` — empty or a recognized trivial sentinel ("same as source", "1:1", "no
   transformation", etc).
2. `CASE_EXPRESSION` — text already containing a `CASE...WHEN...END`, or a plain-English
   `IF x THEN y [ELSE z]` pattern, rewritten into real `CASE WHEN` syntax.
3. `DEFAULT_OR_LOOKUP` — a `COALESCE(...)` already present, or an "X defaults to Y" phrase
   rewritten to `COALESCE(X, Y)`. (A bare "lookup" reference with no resolvable expression is
   intentionally left unclassified here — it falls through to `MANUAL_REVIEW`.)
4. `CONCAT_EXPRESSION` — an explicit `CONCAT(...)` call, a `||` chain, or a `+`-joined chain that
   includes at least one string literal (to distinguish string concatenation from arithmetic).
5. `DIRECT_SQL_FUNCTION` — text containing a call to a function on the whitelist (`SUBSTR`,
   `TRIM`, `CAST`, `UPPER`, `ROUND`, `COALESCE`, `TO_DATE`, etc — plus `SUM`/`AVG`/`COUNT`/
   `MIN`/`MAX` **only** when `allowAggregates` is true).
6. `ARITHMETIC_EXPRESSION` — text that's only identifier characters, whitespace, and
   `+ - * / % ( )` (no arithmetic-looking text with unknown tokens is accepted).

If none of those produce a result whose parentheses balance and whose every identifier-shaped
token is either a known source field, a SQL keyword/type name, a whitelisted function, or (if
allowed) an aggregate function, the result is `MANUAL_REVIEW` — the transformation is surfaced to
the tester verbatim with instructions to translate it by hand, rather than guessing.

`qualifyFieldReferences(expression, knownFields, alias)` is a separate helper (used by
`dashboardKpiGenerator`) that rewrites bare field names in an already-classified expression into
`alias.\`field\`` form, longest field name first so a short field name can't accidentally
partial-match inside a longer one.

**`allowAggregates` is opt-in and deliberately false everywhere except the dashboard-KPI
generator.** Every other generator does a per-row correlated comparison (source row ↔ target
row), where a bare `SUM(...)`/`COUNT(...)` has no valid meaning — only a single whole-table KPI
computation is allowed to use them.

### 8.6 Adding a new test category

1. Add the new key to every `Record<TestCategory, ...>` in `src/types/testCase.ts`
   (`TestCategory`, `TEST_CATEGORIES`, `CATEGORY_LABELS`, `CATEGORY_DESCRIPTIONS`,
   `CATEGORY_PREFIX`, `CATEGORY_DEFAULT_PRIORITY`) — TypeScript won't compile until all are
   updated.
2. Write `src/lib/generators/yourGenerator.ts` exporting a `GeneratorFn` following the existing
   per-table-group loop pattern; consult `getTableTypeConfig()` if your check only makes sense
   for certain `sourceKind`/`targetKind` combinations.
3. Register it in `GENERATORS` in `src/lib/generators/index.ts`.
4. Add a test file using the fixtures in `src/lib/generators/testHelpers.ts`
   (`makeMappingRow()`, `buildContext()`).

No UI changes are needed — `CategorySelectionStep.tsx` iterates `TEST_CATEGORIES` generically and
picks up the new category's card automatically.

## 9. Requirements Traceability Matrix (`rtm.ts`)

`buildRtm(mappingRows, testCases)` produces one `RtmEntry` per `MappingRow` — i.e. per individual
source→target field requirement, not per spreadsheet line (see the multi-line-cell note in §5).
It builds a reverse index from every `TestCase.sourceMappingRowIds` entry back to that row's ID,
so each `RtmEntry.coveredTestCaseIds` lists every generated test case that happens to touch that
requirement. A requirement with zero covering test cases is a **coverage gap**
(`covered: false`) — surfaced in `RtmTable.tsx` with a "Gap" badge and filterable via the "Gaps
only" checkbox in `ResultsStep.tsx`. This view exists specifically so a tester can answer "is
there anything in my mapping doc that generated *no* test coverage at all?" without manually
cross-referencing two lists.

## 10. AI Assist (Optional)

The one deliberate exception to "everything stays in the browser" (§1). Off by default; when a
user enables it in the header menu, it gives **Manual Review** Transformation/Business Rule cases
a second, best-effort translation attempt via a small backend and a shared Anthropic API key —
never a replacement for the deterministic classifier, only a fallback for what it already gave up
on.

**Backend** (`server/`) — a standalone Python/FastAPI app (`main.py` + `requirements.txt`, its own
virtualenv, never touching the frontend's Node toolchain or bloating the Vite bundle). One route,
`POST /api/classify-transformation`, takes `{ transformation, knownFields, targetField }`, calls
the Anthropic API (Python SDK) with a system prompt that restricts the model to producing a single
SQL expression built only from the given column names and a small function/keyword whitelist (or
`null`), and returns `{ expression }` verbatim — it does **not** validate its own output; that
happens back in the browser (see below). `ANTHROPIC_API_KEY` lives only in `server/.env`
(gitignored) and is never sent to or readable by the client. This is a behavioral port of the
Node/Express server in the upstream [ETLtesterApp](https://github.com/meenakour/ETLtesterApp) repo
— identical routes, request/response shapes, validation, and prompt — so the frontend fetch code
(`src/lib/llm/aiAssist.ts`) is completely unchanged and works against either backend.

**Client pieces**:
- `src/state/AiAssistContext.tsx` / `src/hooks/useAiAssist.ts` — persists `enabled` and `serverUrl`
  to `localStorage`, mirroring `ThemeContext`'s pattern. Purely a settings toggle, not app-session
  data, so it's a separate provider from `AppStateContext`.
- `src/lib/llm/aiAssist.ts` — the raw `fetch` client (`checkAiAssistServer`,
  `classifyTransformationWithAi`). Never throws; network/parse failures resolve to
  `{ ok: false, error }` so a bad connection can't crash the enrichment pass.
- `src/lib/llm/aiAssistEnrichment.ts` — the orchestration layer, called from the "Enhance N Manual
  Review cases with AI" button in `ResultsStep.tsx`. For each eligible case (`isManualReview &&`
  category is `TRANSFORMATION_VALIDATION`/`BUSINESS_RULE`), it looks up the originating
  `MappingRow`, rebuilds the exact same `knownFields` whitelist `buildFieldValidationSql` would use
  (`buildKnownFields`, exported from `transformationSql.ts` for this reason), and — this is the
  important part — **independently re-validates** the AI's suggested expression with
  `isSafeSqlExpression()` (exported from `businessRuleHeuristics.ts`) before accepting it. An LLM's
  own claim that its output is correct is never trusted on its own; it has to pass the identical
  balanced-parens + known-field/keyword-whitelist gate every deterministically-matched expression
  passes. A case only flips from `isManualReview` to `isAiSuggested: true` after that check
  succeeds; otherwise it's left completely untouched.
- Accepted suggestions are rebuilt into the same two-query (source/target) SQL shape via
  `buildSourceTargetQueries()` — extracted from `transformationSql.ts`'s deterministic happy path
  specifically so both code paths produce identical output shape (see §8.5/§11's transformation
  query design).
- `AppStateContext`'s `REPLACE_TEST_CASES` action patches `state.testCases` with the enrichment
  result without forcing `step` back to `'results'` (unlike `SET_TEST_CASES`, which is what the
  initial generate-and-navigate flow uses) — enrichment happens *within* the Results step, not as a
  fresh generation.

**Trust boundary, restated**: the backend's job is only to produce a *candidate* string. Every
safety property this app already had (never emit SQL built from an unrecognized token) is
preserved by reusing the exact same validator the deterministic classifier itself is gated by,
applied a second time in the browser to the AI's output specifically.

## 11. Export Formats

All four exporters live in `src/lib/excel/` and share the `downloadTextFile()` /
`XLSX.writeFile()` browser-download mechanism (`src/utils/download.ts` builds a Blob +
object URL + synthetic `<a download>` click, which is why exports never touch a server).

- **Excel workbook** (`exportWorkbook.ts`, `exportTestCasesToExcel`) — four sheets:
  - *Test Cases*: one row per test-case **step**, not per test case. `buildTestCaseRows()`
    expands each `TestCase.steps` array into that many rows, but only populates the common
    columns (ID, name, category, priority, description, SQL, target table, CDE/Manual
    Review/Dashboard Comparison flags) on the **first** row of the block — every continuation
    row leaves those columns blank. This was an explicit, deliberate design choice (not merged
    cells — genuinely blank cells) so the sheet stays easy to filter/sort in Excel without
    fighting merged-cell semantics.
  - *Summary*: counts per category, then per priority, then a grand total.
  - *Manual Review*: the same per-step expansion, filtered to `isManualReview` cases only —
    omitted entirely if there are none.
  - *RTM*: one row per `buildRtm()` entry.
- **`.sql` bundle** (`exportSql.ts`) — flat text file, one comment header + SQL body per test
  case, concatenated. The simplest export, meant for pasting into a SQL editor/notebook by hand.
- **`.ipynb` notebook** (`exportIpynb.ts`, `exportIpynbNotebook`) — a genuine Jupyter notebook
  (`nbformat` 4.5 JSON), one **code cell** per test case (plus one markdown title cell). Every
  code cell is prefixed with a `%sql` magic line — the standard way Databricks recognizes a cell
  as SQL inside an otherwise-Python-kernelled notebook — followed by a commented block containing
  the test case's name/description/steps/expected-result, then the SQL itself. (Earlier in this
  project's history this was built as a Databricks-source-format `.sql` "notebook" file before
  being corrected to a true `.ipynb` per explicit user feedback — see git history if curious.)
- **Azure DevOps CSV** (`exportAzdoCsv.ts`) — matches one specific org's AZDO test-case import
  schema exactly (`AZDO_CSV_HEADERS`): `ID` (left blank on every row — the import process assigns
  a real work-item ID), `Work Item Type`, `Title` (`[TC-ID] name`), then one row per **step**
  (`buildAzdoSteps` appends a final synthetic step that runs the actual SQL and carries the
  expected result), then the org-specific fields (`App_EAICode`, `EAI Code`,
  `TestCaseAutomationStatus`, `ToolsUsed`, `Area Path`, `Assigned To`, `Iteration Path`, `State`).
  Those org-specific fields can't be inferred from a mapping document, so `AzdoExportModal.tsx`
  collects them **once** via a form (`AzdoExportSettings`) and stamps the same values onto every
  row, rather than leaving hundreds of cells blank for the user to fill in by hand after import.

Also: `sampleTemplate.ts` (`downloadSampleTemplate`) generates a two-sheet example workbook using
the app's own canonical header names — offered on the Upload step so a new user without a real
mapping doc handy can see the expected shape immediately.

## 12. UI Layer

Component tree, one directory per wizard step plus shared/common pieces:

```
App.tsx
 └─ ThemeProvider → AppStateProvider → AppShell (Header + StepIndicator + <main>)
      └─ StepRouter switches on AppState.step:
           UploadStep            (components/upload/)
           PreviewStep           (components/preview/)  — 3 tabs: Mapping / Joins / Source-Target Type
           CategorySelectionStep (components/categories/)
           ResultsStep           (components/results/)  — 2 views: Test Cases / RTM
      shared: components/common/ (Badge, Button, Pagination, PriorityBadge, badgeTooltips)
      shared: components/export/ (ExportBar, AzdoExportModal) — used inside ResultsStep
```

Notes on specific pieces:

- **Theming** — `ThemeContext.tsx` toggles a `.dark` class on `<html>`, persisted to
  `localStorage`. All color values in components are CSS custom properties
  (`var(--color-accent)`, etc, defined once and swapped per-theme via Tailwind's
  `@custom-variant dark`) — components never hardcode a light/dark-specific color directly.
- **`ResultsStep.tsx`** owns all of the results-view UI state that doesn't belong in the global
  reducer: search query, category/priority/manual-review/CDE/dashboard-only filters, current
  page, selected test case for the detail drawer, and the RTM "gaps only" toggle. Pagination is
  client-side only (`PAGE_SIZE = 10`, sliced from the already-filtered array) with an effect that
  resets to page 1 whenever any filter changes, so the user is never stranded on a page that no
  longer has data.
- **`TableTypeConfigPanel.tsx`** is the only place `TableTypeConfig` gets edited — each card's
  `update()` closure dispatches `setTableTypeConfig(targetTable, patch)`, merging onto whatever
  config already exists for that table.

## 13. Testing

`npm test` (single run) / `npm run test:watch`, powered by Vitest configured directly in
`vite.config.ts` (no separate Jest/Vitest config file). Nearly every non-trivial `lib/` module has
a co-located `*.test.ts`. Two testing conventions worth knowing:

- **`src/lib/generators/testHelpers.ts`** exports `makeMappingRow(overrides)` (a `MappingRow`
  with sensible defaults, override only what the test cares about) and `buildContext(rows)` (a
  ready-to-use `GeneratorContext` from a row array) — every generator test builds fixtures this
  way instead of hand-constructing the full `GeneratorContext` shape each time.
- **Regression-test-per-bug-class convention**: several test files exist specifically to lock in
  a previously-fixed bug (e.g. `etlSystemFieldSuppression.test.ts`, the `\bword\b`-boundary
  regression tests inside `cde.test.ts`) rather than only testing the happy path. When you fix a
  heuristic bug, add a test asserting the specific input that used to fail, not just a broader
  "does it work" test.

Standard verification triad after any change (matches this project's established habit):
```bash
npx tsc --noEmit
npx vitest run
npm run build
```

## 14. Build & Distribution

- **`vite.config.ts`** wires the `@/*` → `src/*` path alias (also mirrored in `tsconfig.json` for
  editor/type-checking support) and the Vitest `test` config block.
- **`start-app.bat`** — a Windows batch launcher for non-technical / restricted-environment use:
  locates a usable Node.js, runs `npm install` only if `node_modules` is missing, then starts the
  dev server — falling back to invoking `node node_modules\vite\bin\vite.js` directly if `npm`
  itself isn't reachable on a locked-down machine. Uses `setlocal EnableDelayedExpansion` and
  `!errorlevel!` (not `%errorlevel%`) specifically because `%errorlevel%` inside a parenthesized
  `if` block is substituted at parse time, not after the enclosed command runs — a subtle batch
  scripting gotcha that previously caused a false "install failed" report on a fresh clone.
- **`offline-bundle` branch** — a separate long-lived branch with `node_modules` force-added to
  git, for distribution as a single ZIP to machines with no npm registry access at all. Always
  update this branch via `git worktree add` in a separate directory rather than `git checkout`ing
  between it and `main` in the same working directory — the two branches have different
  `node_modules` tracking semantics (force-added vs. gitignored), and switching branches directly
  will delete the directory's contents out from under you.

## 15. Where to Look for X

| I want to change... | Look at |
|---|---|
| Which spreadsheet header spellings are recognized | `src/lib/excel/aliases.ts` |
| How confident a column match needs to be to auto-accept | `src/lib/excel/columnDetection.ts` (`CONFIDENCE_*`) |
| What counts as a Critical Data Element | `src/lib/cde.ts` |
| What counts as an ETL/audit-infrastructure field | `src/lib/etlSystemFields.ts` |
| How a transformation rule gets turned into SQL | `src/lib/generators/businessRuleHeuristics.ts` |
| A specific test category's SQL/wording | `src/lib/generators/<category>Generator.ts` |
| Default priorities or category labels | `src/types/testCase.ts` |
| How file-sourced (L1) or dashboard-targeted (L3) tables are handled | `src/types/tableTypeConfig.ts`, `src/lib/sql/sourceReference.ts` |
| An export file's exact shape | `src/lib/excel/export*.ts` |
| Overall step flow / state shape | `src/state/AppStateContext.tsx` |
| AI Assist's backend / prompt | `server/main.py` |
| AI Assist's client trust boundary | `src/lib/llm/aiAssistEnrichment.ts` |
