import { createContext, useReducer, useRef, useMemo, type ReactNode } from 'react';
import type * as XLSXType from 'xlsx';
import type { SheetData } from '@/types/mapping';
import type { DetectedColumn, MappingFieldKey, JoinFieldKey } from '@/types/columnMapping';
import type { TestCategory, TestCase } from '@/types/testCase';
import { TEST_CATEGORIES } from '@/types/testCase';
import type { TableTypeConfig } from '@/types/tableTypeConfig';
import { DEFAULT_TABLE_TYPE_CONFIG } from '@/types/tableTypeConfig';
import { parseWorkbookFromFile } from '@/lib/excel/parseWorkbook';
import { classifySheets, extractSheetData } from '@/lib/excel/sheetDetection';
import { detectColumns } from '@/lib/excel/columnDetection';
import { MAPPING_FIELD_ALIASES, JOIN_FIELD_ALIASES } from '@/lib/excel/aliases';

export type Step = 'upload' | 'review' | 'results';

export interface AppState {
  step: Step;
  fileName: string | null;
  workbookSheetNames: string[];
  mappingSheetName: string | null;
  joinsSheetName: string | null;
  mappingSheet: SheetData | null;
  joinsSheet: SheetData | null;
  mappingColumns: DetectedColumn<MappingFieldKey>[];
  joinColumns: DetectedColumn<JoinFieldKey>[];
  sheetChoiceNeeded: boolean;
  selectedCategories: TestCategory[];
  testCases: TestCase[];
  error: string | null;
  isLoading: boolean;
  tableTypeConfigs: Record<string, TableTypeConfig>;
}

const initialAppState: AppState = {
  step: 'upload',
  fileName: null,
  workbookSheetNames: [],
  mappingSheetName: null,
  joinsSheetName: null,
  mappingSheet: null,
  joinsSheet: null,
  mappingColumns: [],
  joinColumns: [],
  sheetChoiceNeeded: false,
  selectedCategories: [...TEST_CATEGORIES],
  testCases: [],
  error: null,
  isLoading: false,
  tableTypeConfigs: {},
};

type AppAction =
  | { type: 'SET_LOADING' }
  | {
      type: 'LOAD_WORKBOOK';
      payload: Pick<
        AppState,
        | 'fileName'
        | 'workbookSheetNames'
        | 'mappingSheetName'
        | 'joinsSheetName'
        | 'mappingSheet'
        | 'joinsSheet'
        | 'mappingColumns'
        | 'joinColumns'
        | 'sheetChoiceNeeded'
      >;
    }
  | { type: 'SET_ERROR'; payload: string }
  | {
      type: 'SET_SHEET_SELECTION';
      payload: Pick<
        AppState,
        'mappingSheetName' | 'joinsSheetName' | 'mappingSheet' | 'joinsSheet' | 'mappingColumns' | 'joinColumns'
      >;
    }
  | { type: 'SET_STEP'; payload: Step }
  | { type: 'OVERRIDE_MAPPING_COLUMN'; payload: { field: MappingFieldKey; header: string | null } }
  | { type: 'OVERRIDE_JOIN_COLUMN'; payload: { field: JoinFieldKey; header: string | null } }
  | { type: 'SET_SELECTED_CATEGORIES'; payload: TestCategory[] }
  | { type: 'SET_TEST_CASES'; payload: TestCase[] }
  | { type: 'REPLACE_TEST_CASES'; payload: TestCase[] }
  | { type: 'SET_TABLE_TYPE_CONFIG'; payload: { targetTable: string; config: Partial<TableTypeConfig> } }
  | { type: 'RESET' };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: true, error: null };
    case 'LOAD_WORKBOOK':
      return { ...initialAppState, step: 'review', ...action.payload };
    case 'SET_ERROR':
      return { ...state, isLoading: false, error: action.payload };
    case 'SET_SHEET_SELECTION':
      return { ...state, ...action.payload };
    case 'SET_STEP':
      return { ...state, step: action.payload };
    case 'OVERRIDE_MAPPING_COLUMN':
      return {
        ...state,
        mappingColumns: state.mappingColumns.map((c) =>
          c.field === action.payload.field
            ? { ...c, matchedHeader: action.payload.header, confidence: action.payload.header ? 1 : 0 }
            : c
        ),
      };
    case 'OVERRIDE_JOIN_COLUMN':
      return {
        ...state,
        joinColumns: state.joinColumns.map((c) =>
          c.field === action.payload.field
            ? { ...c, matchedHeader: action.payload.header, confidence: action.payload.header ? 1 : 0 }
            : c
        ),
      };
    case 'SET_SELECTED_CATEGORIES':
      return { ...state, selectedCategories: action.payload };
    case 'SET_TEST_CASES':
      return { ...state, testCases: action.payload, step: 'results' };
    case 'REPLACE_TEST_CASES':
      // Same shape as SET_TEST_CASES but doesn't force step -- used to patch in AI Assist
      // suggestions for existing cases without re-triggering the generate-and-navigate flow.
      return { ...state, testCases: action.payload };
    case 'SET_TABLE_TYPE_CONFIG': {
      const existing = state.tableTypeConfigs[action.payload.targetTable] ?? DEFAULT_TABLE_TYPE_CONFIG;
      return {
        ...state,
        tableTypeConfigs: {
          ...state.tableTypeConfigs,
          [action.payload.targetTable]: { ...existing, ...action.payload.config },
        },
      };
    }
    case 'RESET':
      return { ...initialAppState };
    default:
      return state;
  }
}

export interface AppActions {
  loadFile: (file: File) => Promise<void>;
  selectMappingSheet: (sheetName: string) => void;
  selectJoinsSheet: (sheetName: string) => void;
  overrideMappingColumn: (field: MappingFieldKey, header: string | null) => void;
  overrideJoinColumn: (field: JoinFieldKey, header: string | null) => void;
  setStep: (step: Step) => void;
  setSelectedCategories: (categories: TestCategory[]) => void;
  setTestCases: (testCases: TestCase[]) => void;
  replaceTestCases: (testCases: TestCase[]) => void;
  setTableTypeConfig: (targetTable: string, config: Partial<TableTypeConfig>) => void;
  /** The raw uploaded file, kept alongside the already-parsed workbook -- needed to send the
   *  original bytes to the Python engine's API, which does its own independent parse server-side. */
  getUploadedFile: () => File | null;
  reset: () => void;
}

export const AppStateContext = createContext<{ state: AppState; actions: AppActions } | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialAppState);
  const workbookRef = useRef<XLSXType.WorkBook | null>(null);
  const fileRef = useRef<File | null>(null);

  const buildSheetData = (workbook: XLSXType.WorkBook, mappingName: string | null, joinsName: string | null) => {
    const mappingSheet = mappingName ? extractSheetData(workbook, mappingName) : null;
    const joinsSheet = joinsName ? extractSheetData(workbook, joinsName) : null;
    const mappingColumns = mappingSheet ? detectColumns(mappingSheet.headers, MAPPING_FIELD_ALIASES) : [];
    const joinColumns = joinsSheet ? detectColumns(joinsSheet.headers, JOIN_FIELD_ALIASES) : [];
    return { mappingSheet, joinsSheet, mappingColumns, joinColumns };
  };

  const actions: AppActions = useMemo(
    () => ({
      loadFile: async (file: File) => {
        dispatch({ type: 'SET_LOADING' });
        try {
          const workbook = await parseWorkbookFromFile(file);
          workbookRef.current = workbook;
          fileRef.current = file;
          const classification = classifySheets(workbook);
          const { mappingSheet, joinsSheet, mappingColumns, joinColumns } = buildSheetData(
            workbook,
            classification.mappingSheetName,
            classification.joinsSheetName
          );
          dispatch({
            type: 'LOAD_WORKBOOK',
            payload: {
              fileName: file.name,
              workbookSheetNames: workbook.SheetNames,
              mappingSheetName: classification.mappingSheetName,
              joinsSheetName: classification.joinsSheetName,
              mappingSheet,
              joinsSheet,
              mappingColumns,
              joinColumns,
              sheetChoiceNeeded: classification.ambiguous || workbook.SheetNames.length > 2,
            },
          });
        } catch (err) {
          dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Failed to parse the file.' });
        }
      },
      selectMappingSheet: (sheetName: string) => {
        if (!workbookRef.current) return;
        const { mappingSheet, joinsSheet, mappingColumns, joinColumns } = buildSheetData(
          workbookRef.current,
          sheetName,
          state.joinsSheetName
        );
        dispatch({
          type: 'SET_SHEET_SELECTION',
          payload: { mappingSheetName: sheetName, joinsSheetName: state.joinsSheetName, mappingSheet, joinsSheet, mappingColumns, joinColumns },
        });
      },
      selectJoinsSheet: (sheetName: string) => {
        if (!workbookRef.current) return;
        const { mappingSheet, joinsSheet, mappingColumns, joinColumns } = buildSheetData(
          workbookRef.current,
          state.mappingSheetName,
          sheetName
        );
        dispatch({
          type: 'SET_SHEET_SELECTION',
          payload: { mappingSheetName: state.mappingSheetName, joinsSheetName: sheetName, mappingSheet, joinsSheet, mappingColumns, joinColumns },
        });
      },
      overrideMappingColumn: (field, header) => dispatch({ type: 'OVERRIDE_MAPPING_COLUMN', payload: { field, header } }),
      overrideJoinColumn: (field, header) => dispatch({ type: 'OVERRIDE_JOIN_COLUMN', payload: { field, header } }),
      setStep: (step) => dispatch({ type: 'SET_STEP', payload: step }),
      setSelectedCategories: (categories) => dispatch({ type: 'SET_SELECTED_CATEGORIES', payload: categories }),
      setTestCases: (testCases) => dispatch({ type: 'SET_TEST_CASES', payload: testCases }),
      replaceTestCases: (testCases) => dispatch({ type: 'REPLACE_TEST_CASES', payload: testCases }),
      setTableTypeConfig: (targetTable, config) =>
        dispatch({ type: 'SET_TABLE_TYPE_CONFIG', payload: { targetTable, config } }),
      getUploadedFile: () => fileRef.current,
      reset: () => {
        workbookRef.current = null;
        fileRef.current = null;
        dispatch({ type: 'RESET' });
      },
    }),
    [state.joinsSheetName, state.mappingSheetName]
  );

  return <AppStateContext.Provider value={{ state, actions }}>{children}</AppStateContext.Provider>;
}
