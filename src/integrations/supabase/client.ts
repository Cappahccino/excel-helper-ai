
// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { toast } from 'sonner';

const SUPABASE_URL = "https://saxnxtumstrsqowuwwbt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNheG54dHVtc3Ryc3Fvd3V3d2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc5MDkxODgsImV4cCI6MjA1MzQ4NTE4OH0.ltOp920tiFP9EQab5lJG2_UVRYE0_JIOJ_GMtaGrLxc";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'excel-helper-auth',
  },
});

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log(`Auth state changed: ${event}`, session ? 'User authenticated' : 'No active session');
  
  if (event === 'SIGNED_OUT') {
    // Clear any cached data that might be user-specific
    sessionStorage.clear();
    localStorage.removeItem('excel-helper-auth');
    console.log('Session data cleared on sign out');
  } else if (event === 'SIGNED_IN' && session) {
    console.log('User signed in:', session.user.id);
  } else if (event === 'TOKEN_REFRESHED') {
    console.log('Auth token refreshed successfully');
  } else if (event === 'USER_UPDATED') {
    console.log('User profile updated');
  }
});

// Cache for ID conversions to avoid repeated string operations on the same IDs
const idConversionCache = new Map<string, string>();

/**
 * Converts a potentially temporary workflow ID to a database-compatible UUID
 * @param workflowId The workflow ID to convert (can be with or without temp- prefix)
 * @returns UUID string that can be safely used in database operations
 */
export function convertToDbWorkflowId(workflowId: string): string {
  if (!workflowId) return workflowId;
  
  // Check cache first to avoid redundant string operations
  if (idConversionCache.has(workflowId)) {
    return idConversionCache.get(workflowId)!;
  }
  
  // Using indexOf instead of startsWith for better performance in hot paths
  const result = workflowId.indexOf('temp-') === 0 
    ? workflowId.substring(5) // Remove 'temp-' prefix
    : workflowId; // Already a UUID or other format
  
  // Cache the result for future calls
  idConversionCache.set(workflowId, result);
  
  return result;
}

/**
 * Determines if a workflow ID is temporary based on its format
 * @param workflowId The workflow ID to check
 * @returns boolean indicating if the ID is temporary
 */
export function isTemporaryWorkflowId(workflowId: string): boolean {
  if (!workflowId) return false;
  
  // Using indexOf instead of startsWith for better performance in hot paths
  return workflowId.indexOf('temp-') === 0;
}
