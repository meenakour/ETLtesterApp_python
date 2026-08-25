from engine.business_rule_heuristics import classify_transformation, is_safe_sql_expression, qualify_field_references


def test_trivial_sentinel_classifies_as_direct_copy():
    result = classify_transformation("Same as source", [])
    assert result.strategy == "DIRECT_COPY"
    assert result.expression is None


def test_case_expression_classifies_correctly():
    result = classify_transformation("CASE WHEN status = 'A' THEN 'Active' ELSE 'Inactive' END", ["status"])
    assert result.strategy == "CASE_EXPRESSION"


def test_regression_bare_true_false_boolean_literal_recognized_as_keyword():
    result = classify_transformation("CASE WHEN active_flag = true THEN 'A' ELSE 'B' END", ["active_flag"])
    assert result.strategy == "CASE_EXPRESSION"


def test_if_then_else_rewritten_to_case():
    result = classify_transformation("IF status = 'A' THEN 'Active' ELSE 'Inactive'", ["status"])
    assert result.strategy == "CASE_EXPRESSION"
    assert result.expression == "CASE WHEN status = 'A' THEN 'Active' ELSE 'Inactive' END"


def test_concat_expression_via_function_call():
    result = classify_transformation("concat(first_name, last_name)", ["first_name", "last_name"])
    assert result.strategy == "CONCAT_EXPRESSION"


def test_concat_expression_via_double_pipe():
    result = classify_transformation("first_name || ' ' || last_name", ["first_name", "last_name"])
    assert result.strategy == "CONCAT_EXPRESSION"
    assert result.expression == "CONCAT(first_name, ' ', last_name)"


def test_arithmetic_expression():
    result = classify_transformation("amount * tax_rate", ["amount", "tax_rate"])
    assert result.strategy == "ARITHMETIC_EXPRESSION"


def test_cast_to_date_is_a_direct_sql_function_not_manual_review():
    # Regression: SQL type keywords (DATE, STRING, etc.) must be in the whitelist so CAST(x AS DATE)
    # doesn't get rejected for containing the "unknown" token DATE.
    result = classify_transformation("CAST(signup_date AS DATE)", ["signup_date"])
    assert result.strategy == "DIRECT_SQL_FUNCTION"


def test_falls_back_to_manual_review_when_referencing_an_unknown_field():
    result = classify_transformation("amount * unknown_field", ["amount"])
    assert result.strategy == "MANUAL_REVIEW"
    assert result.expression is None


def test_aggregate_functions_only_allowed_when_allow_aggregates_is_true():
    result_default = classify_transformation("SUM(amount)", ["amount"])
    assert result_default.strategy == "MANUAL_REVIEW"

    result_allowed = classify_transformation("SUM(amount)", ["amount"], allow_aggregates=True)
    assert result_allowed.strategy == "DIRECT_SQL_FUNCTION"


def test_qualify_field_references_prefers_longest_field_first():
    result = qualify_field_references("total_amount + amount", ["amount", "total_amount"], "s")
    assert result == "s.`total_amount` + s.`amount`"


def test_is_safe_sql_expression_rejects_unknown_tokens():
    assert is_safe_sql_expression("amount * tax_rate", ["amount", "tax_rate"]) is True
    assert is_safe_sql_expression("amount * unknown_field", ["amount"]) is False
