from engine.models import JoinFilterRow
from engine.sql_snippets import (
    build_join_clause_lines,
    build_where_clause_lines,
    compute_join_scope,
    filter_conditions_in_scope,
    filter_joins_relevant_to,
    strip_redundant_leading_keyword,
)


def _join(**overrides) -> JoinFilterRow:
    defaults = dict(id="join-x", table_name="", tables_involved=[], raw_row={}, sheet_row_number=1)
    defaults.update(overrides)
    return JoinFilterRow(**defaults)


def test_strip_redundant_leading_keyword_strips_when_present():
    assert strip_redundant_leading_keyword("on srctb1.id = srctb2.id", "on") == "srctb1.id = srctb2.id"
    assert strip_redundant_leading_keyword("ON srctb1.id = srctb2.id", "on") == "srctb1.id = srctb2.id"
    assert strip_redundant_leading_keyword("where amount > 0", "where") == "amount > 0"


def test_strip_redundant_leading_keyword_leaves_normal_conditions_unchanged():
    assert strip_redundant_leading_keyword("srctb1.id = srctb2.id", "on") == "srctb1.id = srctb2.id"
    assert strip_redundant_leading_keyword("amount > 0", "where") == "amount > 0"


def test_strip_redundant_leading_keyword_does_not_false_positive_on_identifier_prefix():
    assert strip_redundant_leading_keyword("on_hold_flag = 'N'", "on") == "on_hold_flag = 'N'"


def test_build_join_clause_lines_only_attaches_relevant_joins():
    joins = [
        _join(table_name="orders", join_condition="orders.id = customers.id", tables_involved=["orders", "customers"]),
        _join(table_name="invoices", join_condition="invoices.id = lines.invoice_id", tables_involved=["invoices", "lines"]),
    ]
    lines = build_join_clause_lines("orders", joins)
    assert len(lines) == 1
    assert "customers" in lines[0]
    assert "invoices" not in "\n".join(lines)


def test_compute_join_scope_expands_transitively():
    joins = [
        _join(table_name="srctb1", join_condition="srctb1.id = srctb2.id", tables_involved=["srctb1", "srctb2"]),
        _join(table_name="srctb2", join_condition="srctb2.cd = srctb3.cd", tables_involved=["srctb2", "srctb3"]),
        _join(table_name="invoices", join_condition="invoices.id = lines.invoice_id", tables_involved=["invoices", "lines"]),
    ]
    scope = compute_join_scope("srctb1", joins)
    assert len(scope.lines) == 2
    assert any("srctb2" in line for line in scope.lines)
    assert any("srctb3" in line for line in scope.lines)
    assert "invoices" not in "\n".join(scope.lines)
    assert scope.tables == {"srctb1", "srctb2", "srctb3"}


def test_regression_handles_schema_table_alias_compound_cells():
    joins = [
        _join(
            table_name="analytics_customer_ddz.t_indv_cust indv_cust",
            join_condition="indv_cust.id = indv_cust_mbr.id",
            tables_involved=[
                "analytics_customer_ddz.t_indv_cust indv_cust",
                "analytics_customer_ddz.t_indv_cust_mbr indv_cust_mbr",
            ],
        )
    ]
    scope = compute_join_scope("t_indv_cust", joins)
    assert scope.lines[0] == (
        "INNER JOIN `analytics_customer_ddz`.`t_indv_cust_mbr` indv_cust_mbr ON indv_cust.id = indv_cust_mbr.id"
    )
    assert scope.tables == {"t_indv_cust", "t_indv_cust_mbr"}
    assert scope.anchor_alias == "indv_cust"


def test_anchor_alias_is_none_when_not_documented():
    joins = [_join(table_name="orders", join_condition="orders.id = customers.id", tables_involved=["orders", "customers"])]
    scope = compute_join_scope("orders", joins)
    assert scope.anchor_alias is None


def test_filter_conditions_in_scope_includes_transitively_reachable_filters():
    joins = [
        _join(table_name="srctb1", join_condition="srctb1.id = srctb2.id", tables_involved=["srctb1", "srctb2"]),
        _join(table_name="srctb1", tables_involved=["srctb1"], filter_condition="srctb1.bgn_dt < CURRENT_DATE"),
        _join(table_name="srctb2", tables_involved=["srctb2"], filter_condition="srctb2.end_dt > CURRENT_DATE"),
        _join(table_name="unrelated", tables_involved=["unrelated"], filter_condition="unrelated.flag = 1"),
    ]
    scope = compute_join_scope("srctb1", joins)
    scoped = filter_conditions_in_scope(joins, scope.tables)
    conditions = [r.filter_condition for r in scoped]
    assert "srctb1.bgn_dt < CURRENT_DATE" in conditions
    assert "srctb2.end_dt > CURRENT_DATE" in conditions
    assert "unrelated.flag = 1" not in conditions


def test_build_where_clause_lines_strips_redundant_where():
    joins = [_join(table_name="orders", filter_condition="where orders.status = 'ACTIVE'")]
    assert build_where_clause_lines(joins) == ["(orders.status = 'ACTIVE')"]


def test_filter_joins_relevant_to():
    relevant = _join(table_name="orders", tables_involved=["orders", "customers"])
    irrelevant = _join(table_name="invoices", tables_involved=["invoices", "lines"])
    assert filter_joins_relevant_to("orders", [relevant, irrelevant]) == [relevant]
