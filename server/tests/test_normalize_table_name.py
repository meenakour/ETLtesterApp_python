from engine.normalize_table_name import normalize_table_name


def test_lowercases_a_bare_table_name():
    assert normalize_table_name("Orders") == "orders"


def test_strips_a_schema_prefix():
    assert normalize_table_name("analytics_customer_ddz.t_indv_cust") == "t_indv_cust"


def test_regression_strips_a_trailing_alias_too():
    # Previously the alias was left attached, so a "schema.table alias" cell never matched the
    # mapping sheet's own (alias-less) Source/Target Table columns and joins silently never attached.
    assert normalize_table_name("analytics_customer_ddz.t_indv_cust indv_cust") == "t_indv_cust"
    assert normalize_table_name("t_indv_cust indv_cust") == "t_indv_cust"


def test_returns_empty_string_for_blank_input():
    assert normalize_table_name("") == ""
    assert normalize_table_name(None) == ""
