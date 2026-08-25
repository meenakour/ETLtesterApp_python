"""Direct port of src/lib/excel/aliases.ts."""

from typing import TypedDict


class AliasSpec(TypedDict, total=False):
    aliases: list[str]
    inverse_aliases: list[str]


MAPPING_FIELD_ALIASES: dict[str, AliasSpec] = {
    "sourceField": {
        "aliases": [
            "source field",
            "src field",
            "source column",
            "src column",
            "source attribute",
            "field name source",
            "source field name",
            "source column name",
        ]
    },
    "sourceTable": {
        "aliases": ["source table", "src table", "source tbl", "from table", "src tbl name", "source table name"]
    },
    "sourceSchema": {"aliases": ["source schema", "src schema", "source db", "source database", "src db"]},
    "transformation": {
        "aliases": [
            "transformation",
            "transformation logic",
            "transformation rule",
            "mapping logic",
            "business rule",
            "derivation logic",
            "expression",
            "rule",
            "logic",
            "transform",
            "transformation rules",
        ]
    },
    "targetField": {
        "aliases": [
            "target field",
            "tgt field",
            "target column",
            "tgt column",
            "destination field",
            "target attribute",
            "field name target",
            "target field name",
            "target column name",
        ]
    },
    "targetTable": {
        "aliases": ["target table", "tgt table", "target tbl", "to table", "destination table", "target table name"]
    },
    "targetSchema": {"aliases": ["target schema", "tgt schema", "target db", "target database", "destination schema"]},
    "sourceDatatype": {
        "aliases": ["source datatype", "src datatype", "source data type", "src data type", "source type"]
    },
    "targetDatatype": {
        "aliases": [
            "target datatype",
            "tgt datatype",
            "target data type",
            "tgt data type",
            "target type",
            "datatype",
            "data type",
        ]
    },
    "primaryKeyFlag": {
        "aliases": ["primary key", "pk", "pk flag", "is primary key", "key", "primary key indicator", "primary key y n"]
    },
    "nullableFlag": {
        "aliases": ["nullable", "null flag", "is nullable", "allow null", "nulls allowed", "null"],
        "inverse_aliases": ["mandatory", "required", "not null"],
    },
    "sourceFileLocation": {
        "aliases": [
            "source file location",
            "source file path",
            "file location",
            "file path",
            "src file location",
            "src file path",
        ]
    },
    "sourceFileName": {"aliases": ["source file name", "file name", "src file name"]},
}

JOIN_FIELD_ALIASES: dict[str, AliasSpec] = {
    "tableName": {"aliases": ["table", "table name", "associated table", "applies to table", "primary table"]},
    "schemaName": {"aliases": ["schema", "schema name"]},
    "joinType": {"aliases": ["join type", "type of join"]},
    "joinCondition": {"aliases": ["join condition", "join on", "on condition", "join clause"]},
    "tablesInvolved": {"aliases": ["tables involved", "joined tables", "tables", "participating tables"]},
    "filterCondition": {"aliases": ["filter", "filter condition", "where", "where clause", "where condition"]},
}
