
import { Json } from '@/types/supabase';

// Define workflow database types
export interface WorkflowDatabaseTypes {
  workflows: {
    id: string;
    name: string;
    description: string | null;
    definition: Json;
    status: string;
    trigger_type: string;
    trigger_config: Json | null;
    created_by: string;
    created_at: string;
    updated_at: string;
    last_run_at: string | null;
    last_run_status: string | null;
    version: number;
    is_template: boolean;
    folder_id: string | null;
  };
  
  workflow_executions: {
    id: string;
    workflow_id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    initiated_by: string | null;
    node_states: Json;
    inputs: Json | null;
    outputs: Json | null;
    error: string | null;
    logs: Json[] | null;
  };
  
  workflow_folders: {
    id: string;
    name: string;
    description: string | null;
    parent_id: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
  };
  
  workflow_schedules: {
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
  
  workflow_templates: {
    id: string;
    name: string;
    description: string | null;
    category: string;
    difficulty: string;
    estimated_time_saved: string | null;
    definition: Json;
    preview_image_url: string | null;
    created_at: string;
    updated_at: string;
    is_official: boolean;
  };
  
  api_credentials: {
    id: string;
    user_id: string;
    service: string;
    name: string;
    credentials_type: string;
    credentials: Json;
    is_valid: boolean;
    last_used_at: string | null;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
  };
  
  service_connections: {
    id: string;
    user_id: string;
    service: string;
    connection_name: string;
    service_metadata: Json | null;
    credential_id: string | null;
    is_active: boolean;
    last_sync_at: string | null;
    created_at: string;
    updated_at: string;
  };
  
  workflow_usage_stats: {
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
  
  workflow_node_usage_stats: {
    id: string;
    node_type: string;
    execution_count: number;
    successful_executions: number;
    failed_executions: number;
    average_duration_ms: number | null;
    last_updated_at: string;
  };
}
