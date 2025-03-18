
// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://saxnxtumstrsqowuwwbt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNheG54dHVtc3Ryc3Fvd3V3d2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc5MDkxODgsImV4cCI6MjA1MzQ4NTE4OH0.ltOp920tiFP9EQab5lJG2_UVRYE0_JIOJ_GMtaGrLxc";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/**
 * Check if a workflow ID is a temporary ID
 */
export function isTemporaryWorkflowId(id: string): boolean {
  return id.startsWith('temp-');
}

/**
 * Convert a workflow ID to a database-friendly ID
 * Removes 'temp-' prefix if present
 */
export function convertToDbWorkflowId(id: string): string {
  if (isTemporaryWorkflowId(id)) {
    return id.substring(5);
  }
  return id;
}
