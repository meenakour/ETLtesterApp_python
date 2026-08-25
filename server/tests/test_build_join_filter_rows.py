from engine.build_join_filter_rows import build_join_filter_rows
from engine.models import DetectedColumn, SheetData


def _sheet(headers: list[str], rows: list[dict]) -> SheetData:
    return SheetData(sheet_name="joins", headers=headers, header_row_index=0, rows=rows)


def _columns(**overrides) -> list[DetectedColumn]:
    fields = ["tableName", "schemaName", "joinType", "joinCondition", "tablesInvolved", "filterCondition"]
    return [DetectedColumn(field=f, matched_header=overrides.get(f), confidence=1.0 if overrides.get(f) else 0.0) for f in fields]


def test_regression_unions_table_name_into_tables_involved_for_split_column_layout():
    sheet = _sheet(
        ["Table1", "table2", "join", "condition"],
        [{"Table1": "srctb1", "table2": "srctb2", "join": "LEFT", "condition": "srctb1.id = srctb2.id"}],
    )
    columns = _columns(tableName="Table1", tablesInvolved="table2", joinType="join", joinCondition="condition")
    rows = build_join_filter_rows(sheet, columns)
    assert len(rows) == 1
    assert rows[0].table_name == "srctb1"
    assert set(rows[0].tables_involved) == {"srctb1", "srctb2"}


def test_does_not_duplicate_table_name_in_a_combined_tables_involved_column():
    sheet = _sheet(
        ["Table", "Tables Involved", "Join Condition"],
        [{"Table": "orders", "Tables Involved": "orders, customers", "Join Condition": "orders.id = customers.id"}],
    )
    columns = _columns(tableName="Table", tablesInvolved="Tables Involved", joinCondition="Join Condition")
    rows = build_join_filter_rows(sheet, columns)
    assert rows[0].tables_involved == ["orders", "customers"]


def test_regression_parses_a_standalone_filter_section():
    sheet = _sheet(
        ["Table1", "table2", "join", "condition"],
        [
            {"Table1": "srctb1", "table2": "srctb2", "join": "LEFT", "condition": "srctb1.id = srctb2.id"},
            {"Table1": "", "table2": "", "join": "", "condition": ""},
            {"Table1": "filter", "table2": "", "join": "", "condition": ""},
            {"Table1": "srctb1.bgn_dt <CURRENT_DATE", "table2": "", "join": "", "condition": ""},
            {"Table1": "srctb2.end_dt >CURRENT_DATE", "table2": "", "join": "", "condition": ""},
        ],
    )
    columns = _columns(tableName="Table1", tablesInvolved="table2", joinType="join", joinCondition="condition")
    rows = build_join_filter_rows(sheet, columns)
    filter_rows = [r for r in rows if r.filter_condition]
    assert len(filter_rows) == 2

    srctb1_filter = next(r for r in filter_rows if r.table_name == "srctb1")
    assert srctb1_filter.filter_condition == "srctb1.bgn_dt <CURRENT_DATE"
    assert srctb1_filter.tables_involved == ["srctb1"]

    srctb2_filter = next(r for r in filter_rows if r.table_name == "srctb2")
    assert srctb2_filter.filter_condition == "srctb2.end_dt >CURRENT_DATE"

    assert any(r.join_condition == "srctb1.id = srctb2.id" for r in rows)


def test_skips_a_filter_row_with_no_recognizable_table_reference():
    sheet = _sheet(
        ["Table1", "table2", "join", "condition"],
        [
            {"Table1": "filter", "table2": "", "join": "", "condition": ""},
            {"Table1": "amount > 0", "table2": "", "join": "", "condition": ""},
        ],
    )
    columns = _columns(tableName="Table1", tablesInvolved="table2", joinType="join", joinCondition="condition")
    rows = build_join_filter_rows(sheet, columns)
    assert rows == []
