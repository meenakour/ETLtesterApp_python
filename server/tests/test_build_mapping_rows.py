from engine.build_mapping_rows import build_mapping_rows
from engine.models import DetectedColumn, SheetData


def _sheet(rows: list[dict]) -> SheetData:
    return SheetData(
        sheet_name="Mapping",
        headers=["Source Field", "Target Field", "Source Table", "Target Table"],
        header_row_index=0,
        rows=rows,
    )


def _columns(**overrides) -> list[DetectedColumn]:
    base = {
        "sourceField": "Source Field",
        "targetField": "Target Field",
        "sourceTable": "Source Table",
        "targetTable": "Target Table",
        "sourceSchema": None,
        "transformation": None,
        "targetSchema": None,
        "sourceDatatype": None,
        "targetDatatype": None,
        "primaryKeyFlag": None,
        "nullableFlag": None,
        "sourceFileLocation": None,
        "sourceFileName": None,
    }
    base.update(overrides)
    return [DetectedColumn(field=k, matched_header=v, confidence=1.0 if v else 0.0) for k, v in base.items()]


def test_parses_a_normal_single_line_row_unchanged():
    sheet = _sheet([{"Source Field": "amount", "Target Field": "amount", "Source Table": "orders", "Target Table": "orders"}])
    rows = build_mapping_rows(sheet, _columns())
    assert len(rows) == 1
    assert rows[0].source_field == "amount"


def test_splits_a_multiline_cell_into_separate_rows():
    sheet = _sheet(
        [{"Source Field": "first_name\nlast_name", "Target Field": "full_name\nfull_name", "Source Table": "orders", "Target Table": "orders"}]
    )
    rows = build_mapping_rows(sheet, _columns())
    assert len(rows) == 2
    assert rows[0].source_field == "first_name"
    assert rows[1].source_field == "last_name"
    assert rows[0].target_field == "full_name"
    assert rows[1].target_field == "full_name"


def test_regression_keeps_only_first_table_when_source_table_lists_more_than_one():
    sheet = _sheet(
        [{"Source Field": "column_1,att_1", "Target Field": "field_1", "Source Table": "srctb1 ,srctb2", "Target Table": "trtable"}]
    )
    rows = build_mapping_rows(sheet, _columns())
    assert rows[0].source_table == "srctb1"


def test_leaves_a_normal_single_source_table_value_unaffected():
    sheet = _sheet([{"Source Field": "amount", "Target Field": "amount", "Source Table": "orders_raw", "Target Table": "orders"}])
    rows = build_mapping_rows(sheet, _columns())
    assert rows[0].source_table == "orders_raw"


def test_regression_blank_nullable_cell_defaults_to_nullable_like_a_missing_column():
    sheet = _sheet(
        [
            {"Source Field": "a", "Target Field": "a", "Source Table": "t", "Target Table": "t", "Null": ""},
            {"Source Field": "b", "Target Field": "b", "Source Table": "t", "Target Table": "t", "Null": "N"},
            {"Source Field": "c", "Target Field": "c", "Source Table": "t", "Target Table": "t", "Null": "Y"},
        ]
    )
    rows = build_mapping_rows(sheet, _columns(nullableFlag="Null"))
    assert rows[0].is_nullable is True  # blank -- unspecified, not an explicit "not nullable"
    assert rows[1].is_nullable is False  # explicit "N"
    assert rows[2].is_nullable is True  # explicit "Y"


def test_regression_blank_cell_in_an_inverted_mandatory_column_also_defaults_to_nullable():
    sheet = _sheet([{"Source Field": "a", "Target Field": "a", "Source Table": "t", "Target Table": "t", "Mandatory": ""}])
    columns = _columns(nullableFlag="Mandatory")
    columns = [c if c.field != "nullableFlag" else DetectedColumn(field=c.field, matched_header=c.matched_header, confidence=c.confidence, inverted=True) for c in columns]
    rows = build_mapping_rows(sheet, columns)
    assert rows[0].is_nullable is True
