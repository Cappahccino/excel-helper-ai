
import { Database } from '@/integrations/supabase/types';

// Extend Database interface to include workflow related tables
export interface ExtendedDatabase extends Database {
  Tables: Database['Tables'] & {
    workflows: {
      Row: {
        id: string;
        name: string;
        description: string | null;
        definition: {
          nodes: any[];
          edges: any[];
        };
        status: string;
        trigger_type: string;
        trigger_config: any | null;
        created_by: string;
        created_at: string;
        updated_at: string;
        last_run_at: string | null;
        last_run_status: string | null;
        version: number;
        is_template: boolean;
        folder_id: string | null;
      };
      Insert: {
        id?: string;
        name: string;
        description?: string | null;
        definition: {
          nodes: any[];
          edges: any[];
        };
        status?: string;
        trigger_type?: string;
        trigger_config?: any | null;
        created_by?: string;
        created_at?: string;
        updated_at?: string;
        last_run_at?: string | null;
        last_run_status?: string | null;
        version?: number;
        is_template?: boolean;
        folder_id?: string | null;
      };
      Update: {
        id?: string;
        name?: string;
        description?: string | null;
        definition?: {
          nodes: any[];
          edges: any[];
        };
        status?: string;
        trigger_type?: string;
        trigger_config?: any | null;
        created_by?: string;
        created_at?: string;
        updated_at?: string;
        last_run_at?: string | null;
        last_run_status?: string | null;
        version?: number;
        is_template?: boolean;
        folder_id?: string | null;
      };
    };
    workflow_executions: {
      Row: {
        id: string;
        workflow_id: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        initiated_by: string | null;
        node_states: Record<string, any>;
        inputs: any | null;
        outputs: any | null;
        error: string | null;
        logs: any[];
      };
      Insert: {
        id?: string;
        workflow_id: string;
        status?: string;
        started_at?: string;
        completed_at?: string | null;
        initiated_by?: string | null;
        node_states?: Record<string, any>;
        inputs?: any | null;
        outputs?: any | null;
        error?: string | null;
        logs?: any[];
      };
      Update: {
        id?: string;
        workflow_id?: string;
        status?: string;
        started_at?: string;
        completed_at?: string | null;
        initiated_by?: string | null;
        node_states?: Record<string, any>;
        inputs?: any | null;
        outputs?: any | null;
        error?: string | null;
        logs?: any[];
      };
    };
    workflow_folders: {
      Row: {
        id: string;
        name: string;
        description: string | null;
        parent_id: string | null;
        created_by: string;
        created_at: string;
        updated_at: string;
      };
      Insert: {
        id?: string;
        name: string;
        description?: string | null;
        parent_id?: string | null;
        created_by?: string;
        created_at?: string;
        updated_at?: string;
      };
      Update: {
        id?: string;
        name?: string;
        description?: string | null;
        parent_id?: string | null;
        created_by?: string;
        created_at?: string;
        updated_at?: string;
      };
    };
    workflow_templates: {
      Row: {
        id: string;
        name: string;
        description: string | null;
        category: string;
        difficulty: string;
        estimated_time_saved: string | null;
        definition: any;
        preview_image_url: string | null;
        created_at: string;
        updated_at: string;
        is_official: boolean;
      };
      Insert: {
        id?: string;
        name: string;
        description?: string | null;
        category: string;
        difficulty: string;
        estimated_time_saved?: string | null;
        definition: any;
        preview_image_url?: string | null;
        created_at?: string;
        updated_at?: string;
        is_official?: boolean;
      };
      Update: {
        id?: string;
        name?: string;
        description?: string | null;
        category?: string;
        difficulty?: string;
        estimated_time_saved?: string | null;
        definition?: any;
        preview_image_url?: string | null;
        created_at?: string;
        updated_at?: string;
        is_official?: boolean;
      };
    };
    api_credentials: {
      Row: {
        id: string;
        user_id: string;
        service: string;
        name: string;
        credentials_type: string;
        credentials: any;
        is_valid: boolean;
        last_used_at: string | null;
        expires_at: string | null;
        created_at: string;
        updated_at: string;
      };
      Insert: {
        id?: string;
        user_id: string;
        service: string;
        name: string;
        credentials_type: string;
        credentials: any;
        is_valid?: boolean;
        last_used_at?: string | null;
        expires_at?: string | null;
        created_at?: string;
        updated_at?: string;
      };
      Update: {
        id?: string;
        user_id?: string;
        service?: string;
        name?: string;
        credentials_type?: string;
        credentials?: any;
        is_valid?: boolean;
        last_used_at?: string | null;
        expires_at?: string | null;
        created_at?: string;
        updated_at?: string;
      };
    };
    service_connections: {
      Row: {
        id: string;
        user_id: string;
        service: string;
        connection_name: string;
        service_metadata: any | null;
        credential_id: string | null;
        is_active: boolean;
        last_sync_at: string | null;
        created_at: string;
        updated_at: string;
      };
      Insert: {
        id?: string;
        user_id: string;
        service: string;
        connection_name: string;
        service_metadata?: any | null;
        credential_id?: string | null;
        is_active?: boolean;
        last_sync_at?: string | null;
        created_at?: string;
        updated_at?: string;
      };
      Update: {
        id?: string;
        user_id?: string;
        service?: string;
        connection_name?: string;
        service_metadata?: any | null;
        credential_id?: string | null;
        is_active?: boolean;
        last_sync_at?: string | null;
        created_at?: string;
        updated_at?: string;
      };
    };
    workflow_schedules: {
      Row: {
        id: string;
        workflow_id: string;
        cron_expression: string;
        timezone: string;
        is_active: boolean;
        last_run_at: string | null;
        next_run_at: string | null;
        created_by: string;
        created_at: string;
        updated_at: string;
      };
      Insert: {
        id?: string;
        workflow_id: string;
        cron_expression: string;
        timezone?: string;
        is_active?: boolean;
        last_run_at?: string | null;
        next_run_at?: string | null;
        created_by: string;
        created_at?: string;
        updated_at?: string;
      };
      Update: {
        id?: string;
        workflow_id?: string;
        cron_expression?: string;
        timezone?: string;
        is_active?: boolean;
        last_run_at?: string | null;
        next_run_at?: string | null;
        created_by?: string;
        created_at?: string;
        updated_at?: string;
      };
    };
    workflow_usage_stats: {
      Row: {
        id: string;
        workflow_id: string;
        execution_count: number;
        successful_executions: number;
        failed_executions: number;
        average_duration_ms: number | null;
        last_30_days_executions: number;
        time_saved_estimate_seconds: number;
        last_updated_at: string;
      };
      Insert: {
        id?: string;
        workflow_id: string;
        execution_count?: number;
        successful_executions?: number;
        failed_executions?: number;
        average_duration_ms?: number | null;
        last_30_days_executions?: number;
        time_saved_estimate_seconds?: number;
        last_updated_at?: string;
      };
      Update: {
        id?: string;
        workflow_id?: string;
        execution_count?: number;
        successful_executions?: number;
        failed_executions?: number;
        average_duration_ms?: number | null;
        last_30_days_executions?: number;
        time_saved_estimate_seconds?: number;
        last_updated_at?: string;
      };
    };
    workflow_node_usage_stats: {
      Row: {
        id: string;
        node_type: string;
        execution_count: number;
        successful_executions: number;
        failed_executions: number;
        average_duration_ms: number | null;
        last_updated_at: string;
      };
      Insert: {
        id?: string;
        node_type: string;
        execution_count?: number;
        successful_executions?: number;
        failed_executions?: number;
        average_duration_ms?: number | null;
        last_updated_at?: string;
      };
      Update: {
        id?: string;
        node_type?: string;
        execution_count?: number;
        successful_executions?: number;
        failed_executions?: number;
        average_duration_ms?: number | null;
        last_updated_at?: string;
      };
    };
  };
  Views: Database['Views'];
  Functions: Database['Functions'] & {
    start_workflow_execution: {
      Args: {
        workflow_id: string;
        inputs?: any;
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
