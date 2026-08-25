"""Data model mirroring the frontend's TypeScript types (src/types/*.ts) field-for-field, so the
JSON this engine returns is a drop-in match for what the browser's own generators already produce
-- the existing React UI, exporters, and RTM view consume it completely unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

MappingFieldKey = Literal[
    "sourceField",
    "sourceTable",
    "sourceSchema",
    "transformation",
    "targetField",
    "targetTable",
    "targetSchema",
    "sourceDatatype",
    "targetDatatype",
    "primaryKeyFlag",
    "nullableFlag",
    "sourceFileLocation",
    "sourceFileName",
]

JoinFieldKey = Literal[
    "tableName",
    "schemaName",
    "joinType",
    "joinCondition",
    "tablesInvolved",
    "filterCondition",
]

TestCategory = Literal[
    "ROW_COUNT_RECONCILIATION",
    "SCHEMA_DATATYPE_VALIDATION",
    "PK_NULL_UNIQUENESS",
    "TRANSFORMATION_VALIDATION",
    "EDGE_CASE_DATATYPE",
    "DQ_CHECKS",
    "BUSINESS_RULE",
    "NEGATIVE_CALCULATION",
    "DASHBOARD_KPI_VALIDATION",
]

TEST_CATEGORIES: list[TestCategory] = [
    "ROW_COUNT_RECONCILIATION",
    "SCHEMA_DATATYPE_VALIDATION",
    "PK_NULL_UNIQUENESS",
    "TRANSFORMATION_VALIDATION",
    "EDGE_CASE_DATATYPE",
    "DQ_CHECKS",
    "BUSINESS_RULE",
    "NEGATIVE_CALCULATION",
    "DASHBOARD_KPI_VALIDATION",
]

Priority = Literal["P1", "P2", "P3"]

CATEGORY_PREFIX: dict[TestCategory, str] = {
    "ROW_COUNT_RECONCILIATION": "RC",
    "SCHEMA_DATATYPE_VALIDATION": "SV",
    "PK_NULL_UNIQUENESS": "PK",
    "TRANSFORMATION_VALIDATION": "TV",
    "EDGE_CASE_DATATYPE": "EC",
    "DQ_CHECKS": "DQ",
    "BUSINESS_RULE": "BR",
    "NEGATIVE_CALCULATION": "NC",
    "DASHBOARD_KPI_VALIDATION": "DK",
}

SourceKind = Literal["table", "file"]
TargetKind = Literal["table", "file", "dashboard"]
FileFormat = Literal["csv", "parquet", "json", "delta"]


@dataclass
class SheetData:
    sheet_name: str
    headers: list[str]
    header_row_index: int
    rows: list[dict[str, Any]]


@dataclass
class DetectedColumn:
    field: str
    matched_header: Optional[str]
    confidence: float
    inverted: bool = False


@dataclass
class MappingRow:
    id: str
    source_field: str = ""
    source_table: str = ""
    source_schema: str = ""
    transformation: str = ""
    target_field: str = ""
    target_table: str = ""
    target_schema: str = ""
    source_datatype: str = ""
    target_datatype: str = ""
    is_primary_key: bool = False
    is_nullable: bool = True
    source_file_location: Optional[str] = None
    source_file_name: Optional[str] = None
    raw_row: dict[str, Any] = field(default_factory=dict)
    sheet_row_number: int = 0

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "sourceField": self.source_field,
            "sourceTable": self.source_table,
            "sourceSchema": self.source_schema,
            "transformation": self.transformation,
            "targetField": self.target_field,
            "targetTable": self.target_table,
            "targetSchema": self.target_schema,
            "sourceDatatype": self.source_datatype,
            "targetDatatype": self.target_datatype,
            "isPrimaryKey": self.is_primary_key,
            "isNullable": self.is_nullable,
            "sourceFileLocation": self.source_file_location,
            "sourceFileName": self.source_file_name,
            "sheetRowNumber": self.sheet_row_number,
        }


@dataclass(eq=False)
class JoinFilterRow:
    id: str
    table_name: str = ""
    schema_name: Optional[str] = None
    join_type: Optional[str] = None
    join_condition: Optional[str] = None
    tables_involved: list[str] = field(default_factory=list)
    filter_condition: Optional[str] = None
    raw_row: dict[str, Any] = field(default_factory=dict)
    sheet_row_number: int = 0


@dataclass
class TableTypeConfig:
    source_kind: SourceKind = "table"
    target_kind: TargetKind = "table"
    source_file_format_override: Optional[FileFormat] = None
    source_file_path_override: Optional[str] = None
    target_file_format_override: Optional[FileFormat] = None
    target_file_path_override: Optional[str] = None
    dashboard_name: Optional[str] = None
    kpi_name: Optional[str] = None


DEFAULT_TABLE_TYPE_CONFIG = TableTypeConfig()


@dataclass
class JoinAssociation:
    joins_by_table: dict[str, list[JoinFilterRow]] = field(default_factory=dict)
    primary_joins_by_table: dict[str, list[JoinFilterRow]] = field(default_factory=dict)
    ambiguous_tables: list[str] = field(default_factory=list)


@dataclass
class GeneratorContext:
    mapping_rows_by_target_table: dict[str, list[MappingRow]]
    join_index: JoinAssociation
    all_mapping_rows: list[MappingRow]
    table_type_configs: dict[str, TableTypeConfig]


@dataclass
class TestCase:
    __test__ = False  # tells pytest this is a data model, not a test class, despite the name

    id: str
    name: str
    category: TestCategory
    priority: Priority
    description: str
    steps: list[str]
    expected_result: str
    sql: str
    target_table: str
    source_mapping_row_ids: list[str]
    is_manual_review: bool = False
    is_cde: bool = False
    is_dashboard_comparison: bool = False
    is_ai_suggested: bool = False

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "priority": self.priority,
            "description": self.description,
            "steps": self.steps,
            "expectedResult": self.expected_result,
            "sql": self.sql,
            "targetTable": self.target_table,
            "sourceMappingRowIds": self.source_mapping_row_ids,
            "isManualReview": self.is_manual_review,
            "isCde": self.is_cde,
            "isDashboardComparison": self.is_dashboard_comparison,
            "isAiSuggested": self.is_ai_suggested,
        }
