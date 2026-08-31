"""Backend for two independent, both-optional features:

1. AI Assist -- holds a single shared Anthropic API key server-side so the browser never has to
   store or expose it, and translates a free-text transformation rule into a SQL expression when
   the frontend's own deterministic classifier gives up. Requires ANTHROPIC_API_KEY; the route
   returns 503 if it isn't configured, rather than the whole server refusing to start, since a
   user may want only the pandas engine below and never touch AI Assist at all.

   This part is a line-for-line behavioral port of the Node/Express version in the original repo
   (meenakour/ETLtesterApp's server/index.js) -- same route, same request/response shape, same
   validation rules, same system prompt -- so src/lib/llm/aiAssist.ts works against it unchanged.

2. The pandas/Python test-case-generation engine (engine/) -- a full re-implementation of the
   frontend's ingestion + all nine generators, for anyone who wants the pipeline running
   server-side instead of in the browser. Needs no API key at all; see engine/pipeline.py.

The main app works completely fine without this server -- both features are opt-in.
"""

import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv

# Load only *this* server's own .env, rather than dotenv's default upward-searching behavior --
# which would otherwise happily pick up an unrelated .env file from a parent directory on the
# host machine (a real, observed failure mode: a stray non-UTF-8 .env several directories up).
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, Form, UploadFile  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from anthropic import Anthropic  # noqa: E402

from engine.pipeline import generate_test_cases  # noqa: E402

PORT = int(os.environ.get("PORT", "8787"))
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
if not API_KEY:
    print(
        "ANTHROPIC_API_KEY is not set -- AI Assist's /api/classify-transformation route will "
        "return 503 until server/.env is configured. The pandas test-case-generation engine "
        "below needs no key and works regardless.",
        file=sys.stderr,
    )
client = Anthropic(api_key=API_KEY) if API_KEY else None

MAX_TRANSFORMATION_LENGTH = 2000
MAX_KNOWN_FIELDS = 300

SYSTEM_PROMPT = """You translate a single ETL mapping-document "transformation rule" (free text, written by a data analyst) into ONE Databricks/Spark SQL expression that computes the target value from source columns.

Rules you MUST follow:
- Use ONLY column names from the provided "known fields" list, and ONLY these SQL functions/keywords: CASE, WHEN, THEN, ELSE, END, AND, OR, NOT, IS, NULL, IN, LIKE, BETWEEN, SUBSTR, SUBSTRING, TRIM, LTRIM, RTRIM, CAST, UPPER, LOWER, ROUND, REPLACE, CONCAT, COALESCE, NVL, IFNULL, TO_DATE, DATE_FORMAT, LENGTH, ABS, plus the standard SQL type names and arithmetic operators (+ - * / %).
- Never invent a column name that is not in the known-fields list. If the rule references something not in that list, or is too ambiguous/prose-like to translate confidently, respond with expression: null.
- Do not include a semicolon, an alias, or a SELECT/FROM clause -- ONLY the bare expression.
- Respond with ONLY a JSON object of the exact shape {"expression": "<sql expression>" | null} and nothing else -- no markdown fences, no explanation."""

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if ALLOWED_ORIGIN == "*" else [ALLOWED_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "model": MODEL}


@app.post("/api/classify-transformation")
async def classify_transformation(payload: dict[str, Any]) -> Any:
    if client is None:
        return JSONResponse(
            status_code=503,
            content={"error": "AI Assist is not configured on this server -- set ANTHROPIC_API_KEY in server/.env"},
        )

    transformation = payload.get("transformation")
    known_fields = payload.get("knownFields")
    target_field = payload.get("targetField")

    if not isinstance(transformation, str) or not transformation.strip():
        return JSONResponse(status_code=400, content={"error": "transformation (non-empty string) is required"})
    if not isinstance(known_fields, list) or any(not isinstance(f, str) for f in known_fields):
        return JSONResponse(status_code=400, content={"error": "knownFields (string[]) is required"})
    if len(transformation) > MAX_TRANSFORMATION_LENGTH:
        return JSONResponse(
            status_code=400, content={"error": f"transformation exceeds {MAX_TRANSFORMATION_LENGTH} characters"}
        )
    if len(known_fields) > MAX_KNOWN_FIELDS:
        return JSONResponse(status_code=400, content={"error": f"knownFields exceeds {MAX_KNOWN_FIELDS} entries"})

    user_message = (
        f"Target field being computed: {target_field if isinstance(target_field, str) else '(unspecified)'}\n"
        f"Known fields (the ONLY column names you may reference): "
        f"{', '.join(known_fields) if known_fields else '(none provided)'}\n"
        f"Transformation rule to translate: {transformation}"
    )

    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=300,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = "".join(block.text for block in message.content if block.type == "text").strip()

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {"expression": None}

        if isinstance(parsed, dict) and isinstance(parsed.get("expression"), str) and parsed["expression"].strip():
            return {"expression": parsed["expression"].strip()}
        return {"expression": None}
    except Exception as err:  # noqa: BLE001 -- deliberately broad: any Anthropic/SDK failure degrades to a 502
        print(f"Anthropic request failed: {err}", file=sys.stderr)
        return JSONResponse(status_code=502, content={"error": "AI classification request failed"})


MAX_PROMPT_LENGTH = 2000
MAX_TARGET_TABLES = 50
MAX_KNOWN_FIELDS_PER_TABLE = 300
MAX_PROPOSED_CASES = 10
VALID_CATEGORIES = {
    "ROW_COUNT_RECONCILIATION",
    "SCHEMA_DATATYPE_VALIDATION",
    "PK_NULL_UNIQUENESS",
    "TRANSFORMATION_VALIDATION",
    "EDGE_CASE_DATATYPE",
    "DQ_CHECKS",
    "BUSINESS_RULE",
    "NEGATIVE_CALCULATION",
    "DASHBOARD_KPI_VALIDATION",
}
VALID_PRIORITIES = {"P1", "P2", "P3"}

SYSTEM_PROMPT_GENERATE = f"""You propose new ETL test cases (up to {MAX_PROPOSED_CASES}) for a data mapping document, based on a tester's free-text request.

Rules you MUST follow:
- Only reference table names from the provided "target tables" list, and only field names from that table's "known fields" list. Never invent a table or field. If the request needs one that isn't present, omit that proposal rather than fabricate.
- Each proposed test case's "category" must be exactly one of: {", ".join(sorted(VALID_CATEGORIES))}.
- Each proposed test case's "priority" must be exactly one of: P1, P2, P3.
- "sql" must be Databricks/Spark SQL, SELECT-only (no DDL/DML such as INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/TRUNCATE/MERGE), no semicolons, and exactly one statement.
- Propose at most {MAX_PROPOSED_CASES} test cases. If the request is too vague or out of scope, return an empty list rather than guessing.
- Respond with ONLY a JSON object of the exact shape {{"testCases": [{{"name": "...", "category": "...", "priority": "...", "description": "...", "steps": ["...", "..."], "expectedResult": "...", "sql": "...", "targetTable": "..."}}]}} and nothing else -- no markdown fences, no explanation."""


@app.post("/api/generate-test-cases-from-prompt")
async def generate_test_cases_from_prompt(payload: dict[str, Any]) -> Any:
    """Byte-for-byte the same request/response contract as the Node/Express version in
    meenakour/ETLtesterApp's server/index.js, so src/lib/llm/generateTestCasesFromPrompt.ts works
    against this server unchanged.
    """
    if client is None:
        return JSONResponse(
            status_code=503,
            content={"error": "AI Assist is not configured on this server -- set ANTHROPIC_API_KEY in server/.env"},
        )

    prompt = payload.get("prompt")
    target_tables = payload.get("targetTables")
    known_fields_by_table = payload.get("knownFieldsByTable")

    if not isinstance(prompt, str) or not prompt.strip():
        return JSONResponse(status_code=400, content={"error": "prompt (non-empty string) is required"})
    if len(prompt) > MAX_PROMPT_LENGTH:
        return JSONResponse(status_code=400, content={"error": f"prompt exceeds {MAX_PROMPT_LENGTH} characters"})
    if not isinstance(target_tables, list) or any(not isinstance(t, str) for t in target_tables):
        return JSONResponse(status_code=400, content={"error": "targetTables (string[]) is required"})
    if len(target_tables) > MAX_TARGET_TABLES:
        return JSONResponse(status_code=400, content={"error": f"targetTables exceeds {MAX_TARGET_TABLES} entries"})
    if not isinstance(known_fields_by_table, dict) or any(
        not isinstance(fields, list)
        or any(not isinstance(f, str) for f in fields)
        or len(fields) > MAX_KNOWN_FIELDS_PER_TABLE
        for fields in known_fields_by_table.values()
    ):
        return JSONResponse(
            status_code=400,
            content={"error": "knownFieldsByTable (Record<string, string[]>, each list capped) is required"},
        )

    fields_lines = "\n".join(
        f"  {t}: {', '.join(known_fields_by_table.get(t, [])) or '(none)'}" for t in target_tables
    )
    user_message = (
        f"Target tables (the ONLY tables you may reference): {', '.join(target_tables) or '(none provided)'}\n"
        f"Known fields per table:\n{fields_lines}\n"
        f"Tester's request: {prompt}"
    )

    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=2000,
            system=SYSTEM_PROMPT_GENERATE,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = "".join(block.text for block in message.content if block.type == "text").strip()
        usage = {
            "inputTokens": getattr(message.usage, "input_tokens", 0) or 0,
            "outputTokens": getattr(message.usage, "output_tokens", 0) or 0,
        }

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {"testCases": [], "usage": usage}

        raw_cases = parsed.get("testCases") if isinstance(parsed, dict) else None
        raw_cases = raw_cases if isinstance(raw_cases, list) else []
        target_table_set = set(target_tables)

        test_cases = []
        for tc in raw_cases:
            if not isinstance(tc, dict):
                continue
            if (
                isinstance(tc.get("name"), str)
                and tc["name"].strip()
                and isinstance(tc.get("sql"), str)
                and tc["sql"].strip()
                and tc.get("category") in VALID_CATEGORIES
                and tc.get("priority") in VALID_PRIORITIES
                and isinstance(tc.get("targetTable"), str)
                and tc["targetTable"] in target_table_set
            ):
                test_cases.append(
                    {
                        "name": tc["name"],
                        "category": tc["category"],
                        "priority": tc["priority"],
                        "description": tc.get("description") if isinstance(tc.get("description"), str) else "",
                        "steps": [s for s in tc.get("steps", []) if isinstance(s, str)] if isinstance(tc.get("steps"), list) else [],
                        "expectedResult": tc.get("expectedResult") if isinstance(tc.get("expectedResult"), str) else "",
                        "sql": tc["sql"],
                        "targetTable": tc["targetTable"],
                    }
                )
            if len(test_cases) >= MAX_PROPOSED_CASES:
                break

        return {"testCases": test_cases, "usage": usage}
    except Exception as err:  # noqa: BLE001 -- deliberately broad: any Anthropic/SDK failure degrades to a 502
        print(f"Anthropic request failed: {err}", file=sys.stderr)
        return JSONResponse(status_code=502, content={"error": "AI test case generation request failed"})


MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25MB -- generous for any real mapping doc, cheap to enforce


@app.post("/api/generate-test-cases")
async def generate_test_cases_endpoint(
    file: UploadFile,
    selected_categories: str = Form(...),
    table_type_configs: str = Form("{}"),
    mapping_sheet_name: Optional[str] = Form(None),
    joins_sheet_name: Optional[str] = Form(None),
) -> Any:
    """Runs the full pandas/Python pipeline (engine/) on an uploaded mapping workbook: sheet
    classification, column detection, mapping/join-row construction, and all nine generators --
    the server-side equivalent of the frontend's own in-browser pipeline. `selected_categories`
    and `table_type_configs` are JSON-encoded strings (multipart form fields can't carry nested
    JSON directly); `table_type_configs` keys are target-table names and values use the same
    camelCase shape as the frontend's TableTypeConfig (sourceKind, targetKind, dashboardName, ...).
    """
    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        return JSONResponse(status_code=400, content={"error": f"file exceeds {MAX_UPLOAD_BYTES} bytes"})

    try:
        categories = json.loads(selected_categories)
        if not isinstance(categories, list) or not all(isinstance(c, str) for c in categories):
            return JSONResponse(status_code=400, content={"error": "selected_categories must be a JSON array of strings"})
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"error": "selected_categories is not valid JSON"})

    try:
        configs = json.loads(table_type_configs)
        if not isinstance(configs, dict):
            return JSONResponse(status_code=400, content={"error": "table_type_configs must be a JSON object"})
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"error": "table_type_configs is not valid JSON"})

    try:
        result = generate_test_cases(
            file_bytes=file_bytes,
            selected_categories=categories,
            table_type_configs=configs,
            mapping_sheet_name=mapping_sheet_name,
            joins_sheet_name=joins_sheet_name,
        )
    except Exception as err:  # noqa: BLE001 -- any parsing/generation failure degrades to a 400, not a crash
        print(f"Test case generation failed: {err}", file=sys.stderr)
        return JSONResponse(status_code=400, content={"error": f"Failed to process workbook: {err}"})

    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
