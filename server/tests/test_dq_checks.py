from engine.generators.dq_checks import generate_dq_checks
from tests.helpers import build_context, make_join, make_mapping_row


def test_regression_referential_integrity_generated_once_in_correct_direction():
    rows = [
        make_mapping_row(target_table="orders", target_field="order_id", is_primary_key=True),
        make_mapping_row(target_table="orders", target_field="customer_id"),
        make_mapping_row(target_table="customers", target_field="customer_id", is_primary_key=True),
        make_mapping_row(target_table="customers", target_field="name"),
    ]
    joins = [
        make_join(table_name="orders", join_condition="orders.customer_id = customers.customer_id", tables_involved=["orders", "customers"]),
    ]
    test_cases = generate_dq_checks(build_context(rows, joins))
    ref_integrity = [tc for tc in test_cases if "referential integrity" in tc.name]

    assert len(ref_integrity) == 1
    assert ref_integrity[0].name == "DQ Check (referential integrity): orders -> customers"
    assert "FROM `orders` c" in ref_integrity[0].sql
    assert "LEFT JOIN `customers` p" in ref_integrity[0].sql


def test_skips_a_join_whose_table_is_not_in_the_mapping_doc():
    rows = [make_mapping_row(target_table="orders", target_field="order_id", is_primary_key=True)]
    joins = [
        make_join(
            table_name="some_other_table_not_in_mapping_doc",
            join_condition="some_other_table_not_in_mapping_doc.id = orders.id",
            tables_involved=["some_other_table_not_in_mapping_doc", "orders"],
        )
    ]
    test_cases = generate_dq_checks(build_context(rows, joins))
    assert not any("referential integrity" in tc.name for tc in test_cases)
