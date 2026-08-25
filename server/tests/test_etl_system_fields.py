from engine.etl_system_fields import is_etl_system_field


def test_matches_known_etl_system_field_patterns():
    assert is_etl_system_field("etl_timestamp") is True
    assert is_etl_system_field("load_date") is True
    assert is_etl_system_field("data_quality_check") is True
    assert is_etl_system_field("batch_id") is True
    assert is_etl_system_field("record_source") is True
    assert is_etl_system_field("dw_load_ts") is True


def test_does_not_false_positive_on_ordinary_business_fields():
    assert is_etl_system_field("order_amount") is False
    assert is_etl_system_field("customer_email") is False
    assert is_etl_system_field("download_count") is False
