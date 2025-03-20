
import { SchemaColumn } from '@/hooks/useNodeManagement';

/**
 * Schema cache entry with metadata
 */
export interface SchemaCacheEntry {
  schema: SchemaColumn[];
  timestamp: number;
  source?: "manual" | "database" | "propagation" | "subscription" | "polling" | "refresh" | "manual_refresh";
  version?: number;
  sheetName?: string;
  isTemporary?: boolean;
  fileId?: string;
}

/**
 * Schema metadata for caching and tracking
 */
export interface SchemaMetadata {
  schema: SchemaColumn[];
  sheetName?: string;
  source?: string;
  version?: number;
  isTemporary?: boolean;
  fileId?: string;
}

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  isValid: boolean;
  errors: SchemaValidationError[];
}

/**
 * Schema validation error
 */
export interface SchemaValidationError {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
}

/**
 * Schema subscription options
 */
export interface SchemaSubscriptionOptions {
  sheetName?: string;
  pollingInterval?: number;
  onSchemaUpdated?: (schema: SchemaColumn[], metadata: SchemaMetadata) => void;
  debug?: boolean;
}

/**
 * Schema update event
 */
export interface SchemaUpdateEvent {
  workflowId: string;
  nodeId: string;
  schema: SchemaColumn[];
  timestamp: number;
  source: string;
  version?: number;
  sheetName?: string;
}
