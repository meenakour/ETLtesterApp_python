from engine.parse_table_ref import TableRef, parse_table_ref


def test_parses_bare_table_name():
    assert parse_table_ref("orders") == TableRef(schema=None, table="orders", alias=None)


def test_parses_schema_table_with_no_alias():
    assert parse_table_ref("analytics_policy_ddz.t_grp_cust_pln_struct") == TableRef(
        schema="analytics_policy_ddz", table="t_grp_cust_pln_struct", alias=None
    )


def test_parses_schema_table_alias_compound_form():
    assert parse_table_ref("analytics_customer_ddz.t_indv_cust indv_cust") == TableRef(
        schema="analytics_customer_ddz", table="t_indv_cust", alias="indv_cust"
    )


def test_parses_table_alias_with_no_schema():
    assert parse_table_ref("t_cvr_sbscr cvr_sbscr") == TableRef(schema=None, table="t_cvr_sbscr", alias="cvr_sbscr")


def test_strips_surrounding_backticks_and_quotes():
    assert parse_table_ref("`analytics_customer_ddz`.`t_indv_cust`") == TableRef(
        schema="analytics_customer_ddz", table="t_indv_cust", alias=None
    )


def test_returns_empty_table_for_blank_input():
    assert parse_table_ref("") == TableRef(table="")
    assert parse_table_ref(None) == TableRef(table="")
