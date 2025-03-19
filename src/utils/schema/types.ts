
import { SchemaColumn } from '@/hooks/useNodeManagement';

/**
 * Type for schema cache entries
 */
export type SchemaCacheEntry = {
  schema: SchemaColumn[];
  timestamp: number;
  sheetName?: string;
  source?: "manual" | "database" | "propagation" | "subscription" | "polling" | "refresh" | "manual_refresh";
  version?: number;
  isTemporary?: boolean;
  fileId?: string;
};

/**
 * Type for schema metadata object returned from cache
 */
export type SchemaMetadata = {
  schema: SchemaColumn[];
  fileId?: string;
  sheetName?: string;
  source?: string;
  version?: number;
  isTemporary?: boolean;
};
