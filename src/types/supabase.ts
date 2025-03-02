
import { Database } from '@/integrations/supabase/types';

// Extend Database interface to include workflow related tables
export interface ExtendedDatabase extends Database {
  Tables: Database['Tables'] & {
    workflows: {
      Row: {
        id: string;
        name: string;
        description: string;
        definition: {
          nodes: any[];
          edges: any[];
        };
        user_id: string;
        created_at: string;
        updated_at: string;
        status: string;
      };
      Insert: {
        id?: string;
        name: string;
        description?: string;
        definition?: {
          nodes: any[];
          edges: any[];
        };
        user_id?: string;
        created_at?: string;
        updated_at?: string;
        status?: string;
      };
      Update: {
        id?: string;
        name?: string;
        description?: string;
        definition?: {
          nodes: any[];
          edges: any[];
        };
        user_id?: string;
        created_at?: string;
        updated_at?: string;
        status?: string;
      };
    };
    workflow_executions: {
      Row: {
        id: string;
        workflow_id: string;
        status: string;
        start_time: string;
        end_time: string | null;
        logs: any[];
        nodeStates: Record<string, any>;
        user_id: string;
        created_at: string;
      };
      Insert: {
        id?: string;
        workflow_id: string;
        status?: string;
        start_time?: string;
        end_time?: string | null;
        logs?: any[];
        nodeStates?: Record<string, any>;
        user_id?: string;
        created_at?: string;
      };
      Update: {
        id?: string;
        workflow_id?: string;
        status?: string;
        start_time?: string;
        end_time?: string | null;
        logs?: any[];
        nodeStates?: Record<string, any>;
        user_id?: string;
        created_at?: string;
      };
    };
    api_credentials: {
      Row: {
        id: string;
        service: string;
        secret: string;
        access_token: string;
        refresh_token: string | null;
        expires_at: string | null;
        user_id: string;
        created_at: string;
      };
      Insert: {
        id?: string;
        service: string;
        secret: string;
        access_token: string;
        refresh_token?: string | null;
        expires_at?: string | null;
        user_id?: string;
        created_at?: string;
      };
      Update: {
        id?: string;
        service?: string;
        secret?: string;
        access_token?: string;
        refresh_token?: string | null;
        expires_at?: string | null;
        user_id?: string;
        created_at?: string;
      };
    };
  };
  Views: Database['Views'];
  Functions: Database['Functions'] & {
    start_workflow_execution: {
      Args: {
        workflow_id: string;
      };
      Returns: {
        execution_id: string;
      };
    };
  };
  Enums: Database['Enums'];
  CompositeTypes: Database['CompositeTypes'];
}

export type Tables = ExtendedDatabase['Tables'];
export type TablesInsert = { [K in keyof Tables]: Tables[K]['Insert'] };
export type TablesUpdate = { [K in keyof Tables]: Tables[K]['Update'] };
export type TablesRow = { [K in keyof Tables]: Tables[K]['Row'] };
export type Functions = ExtendedDatabase['Functions'];
