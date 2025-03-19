
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Track active subscriptions
interface SubscriptionInfo {
  channel: any;
  lastAttempt: number;
  attemptCount: number;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
}

// In-memory store for active subscriptions
const activeSubscriptions: Record<string, SubscriptionInfo> = {};

// Backoff timing configuration
const INITIAL_BACKOFF = 1000; // 1 second
const MAX_BACKOFF = 15000; // 15 seconds
const MAX_ATTEMPTS = 5;

/**
 * Validate if a workflow ID is usable for subscriptions
 */
export function isValidWorkflowId(id: string | null | undefined): boolean {
  if (!id) return false;
  if (id === 'new') return false;
  
  // Check if we're on the /new route for temp IDs
  const isNewRoute = typeof window !== 'undefined' && window.location.pathname.endsWith('/new');
  if (isNewRoute && id.startsWith('temp-')) {
    return false; // Don't allow temp IDs on /new route since they're not saved yet
  }
  
  return true;
}

/**
 * Generate a stable subscription key
 */
export function getSubscriptionKey(type: string, id: string, subType?: string): string {
  return `${type}:${id}${subType ? `:${subType}` : ''}`;
}

/**
 * Get exponential backoff delay based on attempt number
 */
function getBackoffDelay(attempts: number): number {
  return Math.min(INITIAL_BACKOFF * Math.pow(1.5, attempts), MAX_BACKOFF);
}

/**
 * Create and manage a Supabase realtime subscription
 */
export function createSubscription(
  channelName: string,
  config: any,
  handlers: {
    onMessage: (payload: any) => void;
    onStatus?: (status: string) => void;
    onError?: (error: any) => void;
  },
  options?: {
    subscriptionKey?: string;
    debug?: boolean;
    maxAttempts?: number;
  }
): { unsubscribe: () => void } {
  const { 
    subscriptionKey = channelName,
    debug = false,
    maxAttempts = MAX_ATTEMPTS
  } = options || {};
  
  const log = (message: string, ...args: any[]) => {
    if (debug) {
      console.log(`[Subscription:${subscriptionKey}] ${message}`, ...args);
    }
  };
  
  // Check if subscription already exists and is connected
  if (activeSubscriptions[subscriptionKey]) {
    const existing = activeSubscriptions[subscriptionKey];
    if (existing.status === 'connected') {
      log('Reusing existing subscription');
      return {
        unsubscribe: () => removeSubscription(subscriptionKey)
      };
    } else if (existing.status === 'connecting') {
      // Don't create a new one if we're still connecting
      log('Subscription already connecting');
      return {
        unsubscribe: () => removeSubscription(subscriptionKey)
      };
    } else if (Date.now() - existing.lastAttempt < getBackoffDelay(existing.attemptCount)) {
      // Don't reconnect too quickly
      log('Connection attempt throttled, using existing subscription');
      return {
        unsubscribe: () => removeSubscription(subscriptionKey)
      };
    } else {
      // Clean up existing subscription before creating a new one
      log('Removing existing subscription before creating new one');
      removeSubscription(subscriptionKey);
    }
  }
  
  // Track this subscription
  activeSubscriptions[subscriptionKey] = {
    channel: null,
    lastAttempt: Date.now(),
    attemptCount: 0,
    status: 'connecting'
  };
  
  log('Creating new subscription');
  
  try {
    // Create channel with the provided config
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        config,
        (payload) => {
          log('Received message', payload);
          handlers.onMessage(payload);
        }
      )
      .subscribe((status) => {
        log('Subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          activeSubscriptions[subscriptionKey].status = 'connected';
          activeSubscriptions[subscriptionKey].attemptCount = 0;
          if (handlers.onStatus) {
            handlers.onStatus(status);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          activeSubscriptions[subscriptionKey].status = 'error';
          
          if (handlers.onError) {
            handlers.onError(status);
          }
          
          // Attempt reconnection if we haven't exceeded max attempts
          const info = activeSubscriptions[subscriptionKey];
          if (info.attemptCount < maxAttempts) {
            info.attemptCount++;
            info.lastAttempt = Date.now();
            
            const delay = getBackoffDelay(info.attemptCount);
            log(`Scheduling reconnection attempt ${info.attemptCount} in ${delay}ms`);
            
            setTimeout(() => {
              if (activeSubscriptions[subscriptionKey]) {
                log(`Reconnection attempt ${info.attemptCount}`);
                removeSubscription(subscriptionKey);
                createSubscription(channelName, config, handlers, options);
              }
            }, delay);
          } else {
            log(`Max reconnection attempts (${maxAttempts}) reached`);
          }
        }
      });
    
    // Store channel reference
    activeSubscriptions[subscriptionKey].channel = channel;
    
    return {
      unsubscribe: () => removeSubscription(subscriptionKey)
    };
  } catch (error) {
    log('Error creating subscription:', error);
    delete activeSubscriptions[subscriptionKey];
    
    if (handlers.onError) {
      handlers.onError(error);
    }
    
    return {
      unsubscribe: () => {} // No-op since subscription failed
    };
  }
}

/**
 * Remove a subscription by key
 */
export function removeSubscription(subscriptionKey: string): void {
  const info = activeSubscriptions[subscriptionKey];
  if (info && info.channel) {
    try {
      console.log(`Removing subscription: ${subscriptionKey}`);
      supabase.removeChannel(info.channel);
    } catch (error) {
      console.error(`Error removing subscription ${subscriptionKey}:`, error);
    }
  }
  
  delete activeSubscriptions[subscriptionKey];
}

/**
 * Clean up all active subscriptions
 */
export function removeAllSubscriptions(): void {
  Object.keys(activeSubscriptions).forEach(key => {
    removeSubscription(key);
  });
}

/**
 * Get the current status of a subscription
 */
export function getSubscriptionStatus(subscriptionKey: string): string | null {
  return activeSubscriptions[subscriptionKey]?.status || null;
}

/**
 * Utility to create a workflow file subscription with proper error handling
 */
export function createWorkflowFileSubscription(
  workflowId: string,
  nodeId: string,
  fileId: string,
  onUpdate: (payload: any) => void,
  options?: {
    debug?: boolean;
    onStatusChange?: (isSubscribed: boolean) => void;
  }
): { unsubscribe: () => void } {
  // Check for valid workflow ID first
  if (!isValidWorkflowId(workflowId)) {
    console.log(`Skipping file subscription for invalid workflow ID: ${workflowId}`);
    return { unsubscribe: () => {} }; // Return a no-op unsubscribe function
  }
  
  // Normalize workflow ID (remove temp- prefix)
  const normalizedWorkflowId = workflowId.startsWith('temp-') 
    ? workflowId.substring(5) 
    : workflowId;
  
  const subscriptionKey = getSubscriptionKey('workflow_file', `${normalizedWorkflowId}:${nodeId}:${fileId}`);
  const channelName = `workflow_file_${nodeId.replace(/-/g, '_')}`;
  
  return createSubscription(
    channelName,
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'workflow_files',
      filter: `workflow_id=eq.${normalizedWorkflowId} AND node_id=eq.${nodeId} AND file_id=eq.${fileId}`
    },
    {
      onMessage: onUpdate,
      onStatus: (status) => {
        if (options?.onStatusChange) {
          options.onStatusChange(status === 'SUBSCRIBED');
        }
      },
      onError: (error) => {
        console.error(`Workflow file subscription error for ${nodeId}:`, error);
      }
    },
    {
      subscriptionKey,
      debug: options?.debug || false
    }
  );
}

/**
 * Utility to create a workflow execution subscription
 */
export function createWorkflowExecutionSubscription(
  executionId: string,
  onUpdate: (payload: any) => void,
  options?: {
    debug?: boolean;
    onStatusChange?: (isSubscribed: boolean) => void;
  }
): { unsubscribe: () => void } {
  // Check for valid execution ID first
  if (!executionId) {
    console.log(`Skipping execution subscription for invalid execution ID: ${executionId}`);
    return { unsubscribe: () => {} }; // Return a no-op unsubscribe function
  }
  
  const subscriptionKey = getSubscriptionKey('workflow_execution', executionId);
  const channelName = `execution-${executionId}`;
  
  return createSubscription(
    channelName,
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'workflow_executions',
      filter: `id=eq.${executionId}`
    },
    {
      onMessage: onUpdate,
      onStatus: (status) => {
        if (options?.onStatusChange) {
          options.onStatusChange(status === 'SUBSCRIBED');
        }
      },
      onError: (error) => {
        console.error(`Workflow execution subscription error for ${executionId}:`, error);
      }
    },
    {
      subscriptionKey,
      debug: options?.debug || false
    }
  );
}

/**
 * Utility to create a workflow update subscription
 */
export function createWorkflowUpdateSubscription(
  workflowId: string,
  onUpdate: (payload: any) => void,
  options?: {
    debug?: boolean;
    onStatusChange?: (isSubscribed: boolean) => void;
  }
): { unsubscribe: () => void } {
  // Check for valid workflow ID first
  if (!isValidWorkflowId(workflowId)) {
    console.log(`Skipping workflow update subscription for invalid workflow ID: ${workflowId}`);
    return { unsubscribe: () => {} }; // Return a no-op unsubscribe function
  }
  
  // Normalize workflow ID (remove temp- prefix)
  const normalizedWorkflowId = workflowId.startsWith('temp-') 
    ? workflowId.substring(5) 
    : workflowId;
  
  const subscriptionKey = getSubscriptionKey('workflow_update', normalizedWorkflowId);
  const channelName = `workflow-${normalizedWorkflowId}`;
  
  return createSubscription(
    channelName,
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'workflows',
      filter: `id=eq.${normalizedWorkflowId}`
    },
    {
      onMessage: onUpdate,
      onStatus: (status) => {
        if (options?.onStatusChange) {
          options.onStatusChange(status === 'SUBSCRIBED');
        }
      },
      onError: (error) => {
        console.error(`Workflow update subscription error for ${normalizedWorkflowId}:`, error);
      }
    },
    {
      subscriptionKey,
      debug: options?.debug || false
    }
  );
}
