"""End-to-end test driving the full pipeline (sheet detection -> column detection -> mapping/join
row construction -> all nine generators) against an in-memory workbook shaped like the real
user-supplied mapping document that originally surfaced the row-count/join/transformation bugs
this engine is a faithful port of.
"""

from __future__ import annotations

import io

import openpyxl

from engine.pipeline import generate_test_cases


def _build_sample_workbook() -> bytes:
    wb = openpyxl.Workbook()
    mapping = wb.active
    mapping.title = "mapping_1"
    mapping.append(
        ["S.No", "target database", "target table name", "target field", "Definition", "datatype", "PK", "Source database", "Source table name", "Source column", "transformation", "pii/spii", "Null"]
    )
    mapping.append([1, "ABC", "trtable", "field_1", "field_1", "string", "Y", "XYZ", "srctb1 ,srctb2", "column_1,att_1", "concat(column_1,att_1)", "", ""])
    mapping.append([2, "ABC", "trtable", "field_4", "field_4", "string", "", "XYZ", "srctb1", "column_4", "", "", ""])
    mapping.append([3, "ABC", "trtable", "field_6_cust", "field_6_cust", "int", "", "XYZ", "srctb3", "column_6_cust", "", "", ""])
    mapping.append([4, "ABC", "trtable", "field_8_percent", "field_8_percent", "decimal(10.2)", "", "XYZ", "srctb3", "column_8_percent", "column_7_count/100", "", ""])

    joins = wb.create_sheet("joins and filters")
    joins.append(["Table1", "table2", "join", "condition"])
    joins.append(["srctb1", "srctb2", "LEFT", "on srctb1.id =srctb2.id and srctb2.id is NOT NULL"])
    joins.append(["srctb2", "srctb3", "LEFT", "on srctb2.cd =srctb3.cd and srctb2.id>0"])
    for _ in range(10):
        joins.append(["", "", "", ""])
    joins.append(["filter", "", "", ""])
    joins.append(["srctb1.bgn_dt <CURRENT_DATE", "", "", ""])
    joins.append(["srctb2.end_dt >CURRENT_DATE", "", "", ""])

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def test_end_to_end_matches_the_verified_frontend_behavior():
    file_bytes = _build_sample_workbook()
    result = generate_test_cases(
        file_bytes=file_bytes,
        selected_categories=["ROW_COUNT_RECONCILIATION", "TRANSFORMATION_VALIDATION", "BUSINESS_RULE"],
        mapping_sheet_name="mapping_1",
        joins_sheet_name="joins and filters",
    )

    row_count_cases = [tc for tc in result["testCases"] if tc["category"] == "ROW_COUNT_RECONCILIATION"]
    assert len(row_count_cases) == 1  # not one per joined table
    sql = row_count_cases[0]["sql"]
    assert "FROM `XYZ`.`srctb1`" in sql
    assert "LEFT JOIN `srctb2` ON srctb1.id =srctb2.id and srctb2.id is NOT NULL" in sql
    assert "LEFT JOIN `srctb3` ON srctb2.cd =srctb3.cd and srctb2.id>0" in sql  # transitive
    assert "WHERE (srctb1.bgn_dt <CURRENT_DATE)" in sql
    assert "AND (srctb2.end_dt >CURRENT_DATE)" in sql  # transitively-scoped filter
    assert "ON on " not in sql  # no doubled ON keyword

    transformation_cases = [tc for tc in result["testCases"] if tc["category"] == "TRANSFORMATION_VALIDATION"]
    assert any("field_1" in tc["name"] for tc in transformation_cases)  # concat(column_1,att_1) correctly classified
    field_1_case = next(tc for tc in transformation_cases if "field_1" in tc["name"])
    assert "concat(s.`column_1`,s.`att_1`)" in field_1_case["sql"]  # compound cell split into two real columns
