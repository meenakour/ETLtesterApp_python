from engine.generators.row_count import generate_row_count_tests
from engine.models import TableTypeConfig
from tests.helpers import build_context, make_join, make_mapping_row


def test_generates_a_normal_table_to_table_row_count_reconciliation_by_default():
    rows = [make_mapping_row(source_table="orders_raw", target_table="orders", target_schema="curated")]
    test_cases = generate_row_count_tests(build_context(rows))
    assert len(test_cases) == 1
    assert "`orders_raw`" in test_cases[0].sql
    assert "`curated`.`orders`" in test_cases[0].sql


def test_skips_a_dashboard_targeted_table():
    rows = [make_mapping_row(source_table="orders_raw", target_table="revenue_kpi")]
    config = TableTypeConfig(target_kind="dashboard")
    test_cases = generate_row_count_tests(build_context(rows, table_type_configs={"revenue_kpi": config}))
    assert test_cases == []


def test_regression_generates_exactly_one_case_even_with_several_joined_lookup_tables():
    rows = [
        make_mapping_row(source_table="orders_raw", source_field="order_id", target_table="orders", target_field="order_id"),
        make_mapping_row(source_table="orders_raw", source_field="order_date", target_table="orders", target_field="order_date"),
        make_mapping_row(source_table="orders_raw", source_field="amount", target_table="orders", target_field="amount"),
        make_mapping_row(source_table="customers", source_field="name", target_table="orders", target_field="customer_name"),
        make_mapping_row(source_table="products", source_field="name", target_table="orders", target_field="product_name"),
        make_mapping_row(source_table="warehouses", source_field="code", target_table="orders", target_field="warehouse_code"),
    ]
    test_cases = generate_row_count_tests(build_context(rows))
    assert len(test_cases) == 1
    assert test_cases[0].name == "Row Count Reconciliation: orders_raw -> orders"


def test_regression_never_attaches_a_join_documented_for_a_different_table():
    rows = [make_mapping_row(source_table="orders", source_field="order_id", target_table="orders", target_field="order_id")]
    joins = [
        make_join(table_name="orders", join_condition="orders.customer_id = customers.customer_id", tables_involved=["orders", "customers"]),
        make_join(table_name="invoices", join_condition="invoices.id = invoice_lines.invoice_id", tables_involved=["invoices", "invoice_lines"]),
    ]
    test_cases = generate_row_count_tests(build_context(rows, joins))
    assert len(test_cases) == 1
    sql = test_cases[0].sql
    assert "JOIN `customers` ON orders.customer_id = customers.customer_id" in sql
    assert "invoice" not in sql
    assert "JOIN `orders` ON" not in sql  # no self-join


def test_regression_expands_transitively_and_includes_reachable_filters():
    rows = [
        make_mapping_row(source_table="srctb1", source_field="id", target_table="trtable", target_field="id"),
    ]
    joins = [
        make_join(table_name="srctb1", join_condition="srctb1.id = srctb2.id", tables_involved=["srctb1", "srctb2"]),
        make_join(table_name="srctb2", join_condition="srctb2.cd = srctb3.cd", tables_involved=["srctb2", "srctb3"]),
        make_join(table_name="srctb1", tables_involved=["srctb1"], filter_condition="srctb1.bgn_dt < CURRENT_DATE"),
        make_join(table_name="srctb2", tables_involved=["srctb2"], filter_condition="srctb2.end_dt > CURRENT_DATE"),
    ]
    test_cases = generate_row_count_tests(build_context(rows, joins))
    sql = test_cases[0].sql
    assert "`srctb2`" in sql
    assert "`srctb3`" in sql
    assert "srctb1.bgn_dt < CURRENT_DATE" in sql
    assert "srctb2.end_dt > CURRENT_DATE" in sql
