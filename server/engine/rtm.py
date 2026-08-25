"""Direct port of src/lib/rtm.ts."""

from __future__ import annotations

from dataclasses import dataclass

from engine.models import MappingRow, TestCase


@dataclass
class RtmEntry:
    requirement_id: str
    mapping_row_id: str
    source_table: str
    source_field: str
    target_table: str
    target_field: str
    transformation: str
    is_primary_key: bool
    is_nullable: bool
    covered_test_case_ids: list[str]
    test_case_count: int
    covered: bool

    def to_json(self) -> dict:
        return {
            "requirementId": self.requirement_id,
            "mappingRowId": self.mapping_row_id,
            "sourceTable": self.source_table,
            "sourceField": self.source_field,
            "targetTable": self.target_table,
            "targetField": self.target_field,
            "transformation": self.transformation,
            "isPrimaryKey": self.is_primary_key,
            "isNullable": self.is_nullable,
            "coveredTestCaseIds": self.covered_test_case_ids,
            "testCaseCount": self.test_case_count,
            "covered": self.covered,
        }


def build_rtm(mapping_rows: list[MappingRow], test_cases: list[TestCase]) -> list[RtmEntry]:
    test_cases_by_mapping_row: dict[str, list[TestCase]] = {}
    for tc in test_cases:
        for row_id in tc.source_mapping_row_ids:
            test_cases_by_mapping_row.setdefault(row_id, []).append(tc)

    entries: list[RtmEntry] = []
    for index, row in enumerate(mapping_rows):
        covering = test_cases_by_mapping_row.get(row.id, [])
        entries.append(
            RtmEntry(
                requirement_id=f"REQ-{index + 1:03d}",
                mapping_row_id=row.id,
                source_table=row.source_table,
                source_field=row.source_field,
                target_table=row.target_table,
                target_field=row.target_field,
                transformation=row.transformation,
                is_primary_key=row.is_primary_key,
                is_nullable=row.is_nullable,
                covered_test_case_ids=[tc.id for tc in covering],
                test_case_count=len(covering),
                covered=len(covering) > 0,
            )
        )
    return entries
