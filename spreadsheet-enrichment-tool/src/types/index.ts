// CSV and Table Types
export type CellValue = string | number | null;

export interface TableRow {
  [key: string]: CellValue;
}

export interface Column {
  name: string;
  dataType: DataType;
  isEnrichment: boolean;
  enrichmentConfig?: EnrichmentConfig;
}

export const DataType = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  URL: 'url',
} as const;

export type DataType = typeof DataType[keyof typeof DataType];

// Enrichment Types
export const EnrichmentType = {
  RESEARCH: 'research',
  CUSTOM_LLM: 'custom_llm',
} as const;

export type EnrichmentType = typeof EnrichmentType[keyof typeof EnrichmentType];

export const EnrichmentStatus = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error',
} as const;

export type EnrichmentStatus = typeof EnrichmentStatus[keyof typeof EnrichmentStatus];

export interface EnrichmentConfig {
  type: EnrichmentType;
  prompt: string;
  inputColumns: string[];
  columnName: string;
}

export interface EnrichmentResult {
  rowIndex: number;
  status: EnrichmentStatus;
  value?: string;
  error?: string;
}

export interface ProcessingProgress {
  total: number;
  processed: number;
  columnName: string;
}

// Project Types
export interface Project {
  id: string;
  name: string;
  data: TableRow[];
  columns: Column[];
  selectedRows: Set<number>;
  searchQuery: string;
  processingProgress: ProcessingProgress | null;
}

// API Types
export interface APIKeys {
  claude?: string;
  spider?: string;
  model?: ClaudeModel;
}

export const ClaudeModel = {
  HAIKU: 'claude-3-haiku-20240307',
  SONNET: 'claude-3-5-sonnet-20241022',
  OPUS: 'claude-3-opus-20240229',
} as const;

export type ClaudeModel = typeof ClaudeModel[keyof typeof ClaudeModel];

// Context Types
export interface AppState {
  projects: Project[];
  activeProjectId: string | null;
  apiKeys: APIKeys;
  showSettings: boolean;
  showAddEnrichment: boolean;
}

export interface AppContextType {
  state: AppState;
  uploadCSV: (file: File) => Promise<void>;
  closeProject: (projectId: string) => void;
  setActiveProject: (projectId: string) => void;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  addEnrichmentColumn: (projectId: string, config: EnrichmentConfig) => void;
  deleteColumn: (projectId: string, columnName: string) => void;
  renameColumn: (projectId: string, oldName: string, newName: string) => void;
  runEnrichment: (projectId: string, columnName: string, rowLimit?: number) => Promise<void>;
  deleteRows: (projectId: string, rowIndices: number[]) => void;
  exportCSV: (projectId: string, filename: string) => void;
  setSearchQuery: (projectId: string, query: string) => void;
  toggleRowSelection: (projectId: string, rowIndex: number) => void;
  setAPIKeys: (keys: APIKeys) => void;
  setShowSettings: (show: boolean) => void;
  setShowAddEnrichment: (show: boolean) => void;
}

// UI Component Types
export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}
