"""AI Assist backend (Python/FastAPI port).

Optional backend for the app's AI Assist feature. Holds a single shared Anthropic API key
server-side so the browser never has to store or expose it, and exposes one endpoint that
translates a free-text transformation rule into a SQL expression when the app's own
deterministic classifier gives up (i.e. only for rows that would otherwise be flagged
Manual Review). The main app works completely fine without this server.

This is a line-for-line behavioral port of the Node/Express version in the original repo
(meenakour/ETLtesterApp's server/index.js) -- same two routes, same request/response shapes,
same validation rules, same system prompt -- so the React frontend's fetch calls in
src/lib/llm/aiAssist.ts work against this server completely unchanged.
"""

import json
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Load only *this* server's own .env, rather than dotenv's default upward-searching behavior --
# which would otherwise happily pick up an unrelated .env file from a parent directory on the
# host machine (a real, observed failure mode: a stray non-UTF-8 .env several directories up).
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from anthropic import Anthropic  # noqa: E402

PORT = int(os.environ.get("PORT", "8787"))
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
if not API_KEY:
    print(
        "ANTHROPIC_API_KEY is not set. Copy server/.env.example to server/.env and fill it in.",
        file=sys.stderr,
    )
    sys.exit(1)

client = Anthropic(api_key=API_KEY)

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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
