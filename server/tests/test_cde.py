from engine.cde import is_cde_identifier, is_critical_data_element


def test_matches_common_identifier_style_field_names():
    assert is_cde_identifier("customer_id") is True
    assert is_cde_identifier("id") is True
    assert is_cde_identifier("account_number") is True
    assert is_cde_identifier("ssn") is True


def test_does_not_assume_a_code_suffix_is_unique():
    assert is_cde_identifier("status_code") is False
    assert is_cde_identifier("source_system_code") is False


def test_matches_critical_keywords_as_a_snake_case_suffix():
    # An underscore is a regex word character in JS but not a boundary concern here since Python
    # patterns for these don't use \b either -- still worth locking in the exact behavior.
    assert is_critical_data_element("total_amount") is True
    assert is_critical_data_element("active_flag") is True
    assert is_critical_data_element("customer_ssn") is True
    assert is_critical_data_element("account_balance") is True


def test_still_flags_a_plain_code_classification_field_as_critical():
    assert is_critical_data_element("source_system_code") is True


def test_regression_never_flags_etl_infrastructure_fields_as_critical():
    assert is_critical_data_element("etl_timestamp") is False
    assert is_critical_data_element("batch_id") is False
    assert is_cde_identifier("batch_id") is False
    # data_quality_check_code is excluded as an ETL/DQ-infrastructure field, not a business CDE.
    assert is_critical_data_element("data_quality_check_code") is False
