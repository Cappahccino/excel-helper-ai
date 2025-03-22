
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Message, ProcessingStage } from '@/types/chat';
import { useQueryClient } from '@tanstack/react-query';

// Constants for connection management
const HEARTBEAT_INTERVAL = 15000; // 15 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const CONNECTION_TIMEOUT = 10000; // 10 seconds for initial connection

interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  lastHeartbeat: number | null;
  reconnectAttempts: number;
  lastError: string | null;
}

interface UseChatRealtimeProps {
  sessionId: string | null;
  refetch: () => Promise<any>;
  onAssistantMessage?: (message: Message) => void;
  onStatusChange?: (status: Message['status'], messageId: string) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: string) => void;
}

/**
 * Enhanced hook for real-time chat updates with improved connection management
 */
export function useChatRealtime({ 
  sessionId, 
  refetch, 
  onAssistantMessage,
  onStatusChange,
  onConnectionChange,
  onError
}: UseChatRealtimeProps) {
  // State for tracking the message status and content
  const [status, setStatus] = useState<Message['status']>();
  const [content, setContent] = useState<string>();
  const [latestMessageId, setLatestMessageId] = useState<string | null>(null);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>();
  
  // Enhanced connection state tracking
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    isConnecting: false,
    lastHeartbeat: null,
    reconnectAttempts: 0,
    lastError: null,
  });
  
  // References for cleanup and monitoring
  const channelRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const queryClient = useQueryClient();

  /**
   * Update connection state and notify listeners
   */
  const updateConnectionState = useCallback((update: Partial<ConnectionState>) => {
    setConnectionState(prev => {
      const newState = { ...prev, ...update };
      
      // Notify of connection changes if the connected state changed
      if (prev.isConnected !== newState.isConnected && onConnectionChange) {
        onConnectionChange(newState.isConnected);
      }
      
      // Notify of errors if a new error occurred
      if (newState.lastError && newState.lastError !== prev.lastError && onError) {
        onError(newState.lastError);
      }
      
      return newState;
    });
  }, [onConnectionChange, onError]);

  /**
   * Send a heartbeat to verify the connection is still alive
   */
  const sendHeartbeat = useCallback(() => {
    if (!sessionId || !channelRef.current) return;
    
    // Check if we've received updates recently
    const now = Date.now();
    const lastHeartbeat = connectionState.lastHeartbeat;
    
    if (lastHeartbeat && now - lastHeartbeat > HEARTBEAT_INTERVAL * 2) {
      console.warn(`No updates received for ${(now - lastHeartbeat)/1000}s, connection may be stale`);
      
      // Verify connection by checking the database directly
      supabase
        .from('chat_sessions')
        .select('session_id')
        .eq('session_id', sessionId)
        .single()
        .then(({ error }) => {
          if (error) {
            console.error('Failed to verify connection:', error);
            updateConnectionState({ 
              isConnected: false, 
              lastError: `Connection verification failed: ${error.message}` 
            });
            scheduleReconnect();
          } else {
            // Update heartbeat timestamp even if no messages, connection is working
            updateConnectionState({ lastHeartbeat: now });
          }
        });
    }
  }, [sessionId, connectionState.lastHeartbeat, updateConnectionState]);

  /**
   * Set up heartbeat interval to detect silent connection failures
   */
  const setupHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [sendHeartbeat]);

  /**
   * Enhanced function to establish the realtime connection with timeout
   */
  const establishConnection = useCallback(() => {
    if (!sessionId) return null;
    
    // Set connecting state
    updateConnectionState({ isConnecting: true, lastError: null });
    
    console.log('Setting up realtime subscription for session:', sessionId);
    
    // Set connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    
    connectionTimeoutRef.current = setTimeout(() => {
      if (!connectionState.isConnected && connectionState.isConnecting) {
        console.error(`Connection attempt timed out after ${CONNECTION_TIMEOUT/1000}s`);
        updateConnectionState({ 
          isConnecting: false, 
          lastError: 'Connection timed out. Attempting to reconnect...' 
        });
        scheduleReconnect();
      }
    }, CONNECTION_TIMEOUT);
    
    const channel = supabase
      .channel(`chat-updates-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          console.log('Received realtime update:', payload);
          
          // Update connection state with successful heartbeat
          updateConnectionState({ 
            isConnected: true, 
            isConnecting: false,
            lastHeartbeat: Date.now(),
            reconnectAttempts: 0,
            lastError: null
          });
          
          const message = payload.new as Message;
          
          if (message.role === 'assistant') {
            setStatus(message.status);
            setContent(message.content);
            setLatestMessageId(message.id);
            setProcessingStage(message.metadata?.processing_stage);
            
            // Immediately update the query cache for a smoother UI experience
            queryClient.setQueryData(['chat-messages', sessionId], (old: any) => {
              if (!old?.pages?.[0]) return old;

              const updatedPages = old.pages.map((page: any) => ({
                ...page,
                messages: page.messages.map((msg: Message) =>
                  msg.id === message.id ? message : msg
                ),
              }));

              return {
                ...old,
                pages: updatedPages,
              };
            });

            // Notify when message is complete
            if (message.status === 'completed' && onAssistantMessage) {
              onAssistantMessage(message);
              await refetch();
            }
            
            // Notify of status changes
            if (onStatusChange) {
              onStatusChange(message.status, message.id);
            }
          }

          // For other status changes, ensure data consistency
          if (['failed', 'cancelled', 'expired'].includes(message.status)) {
            await refetch();
          }
        }
      )
      .subscribe((status) => {
        // Clear connection timeout since we got a response
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        
        if (status === 'SUBSCRIBED') {
          console.log(`Successfully subscribed to updates for session ${sessionId}`);
          updateConnectionState({ 
            isConnected: true, 
            isConnecting: false,
            lastHeartbeat: Date.now()
          });
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Error connecting to realtime updates for session ${sessionId}`);
          updateConnectionState({ 
            isConnected: false, 
            isConnecting: false,
            lastError: 'Failed to connect to update channel' 
          });
          scheduleReconnect();
        } else if (status === 'TIMED_OUT') {
          console.warn(`Connection timed out for session ${sessionId}`);
          updateConnectionState({ 
            isConnected: false, 
            isConnecting: false,
            lastError: 'Connection timed out' 
          });
          scheduleReconnect();
        }
      });
      
    channelRef.current = channel;
    return channel;
  }, [
    sessionId, 
    refetch, 
    onAssistantMessage, 
    onStatusChange, 
    queryClient, 
    updateConnectionState, 
    connectionState.isConnected, 
    connectionState.isConnecting
  ]);

  /**
   * Enhanced function to schedule a reconnection attempt with better backoff algorithm
   */
  const scheduleReconnect = useCallback(() => {
    // Don't schedule if we've reached the maximum attempts
    if (connectionState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      updateConnectionState({ 
        lastError: `Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts. Please refresh the page.` 
      });
      return;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    // Improved exponential backoff with jitter for better distribution of retry attempts
    const backoffDelay = RECONNECT_BASE_DELAY * Math.pow(1.5, connectionState.reconnectAttempts);
    const jitter = Math.random() * 0.3 + 0.85; // Random between 0.85 and 1.15
    const delay = Math.min(backoffDelay * jitter, MAX_RECONNECT_DELAY);
    
    console.log(`Scheduling reconnect attempt ${connectionState.reconnectAttempts + 1} in ${delay/1000}s`);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      console.log(`Attempting to reconnect (attempt ${connectionState.reconnectAttempts + 1})`);
      updateConnectionState({ 
        reconnectAttempts: connectionState.reconnectAttempts + 1,
        isConnecting: true 
      });
      
      // Clean up existing connection
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      
      // Establish new connection
      establishConnection();
    }, delay);
  }, [connectionState.reconnectAttempts, establishConnection, updateConnectionState]);

  /**
   * Manual reconnect method that can be exposed to UI
   */
  const reconnect = useCallback(() => {
    updateConnectionState({ 
      reconnectAttempts: 0,
      lastError: null,
      isConnecting: true
    });
    
    // Clean up existing connection
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    
    // Cancel any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Establish new connection
    establishConnection();
  }, [establishConnection, updateConnectionState]);

  // Set up the subscription when the session ID changes
  useEffect(() => {
    const channel = establishConnection();
    const cleanupHeartbeat = setupHeartbeat();
    
    // Clean up subscription on unmount or session change
    return () => {
      console.log('Cleaning up realtime subscription');
      
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (channel) {
        supabase.removeChannel(channel);
      }
      
      cleanupHeartbeat();
    };
  }, [sessionId, establishConnection, setupHeartbeat]);

  // Reset state when session changes
  useEffect(() => {
    setStatus(undefined);
    setContent(undefined);
    setLatestMessageId(null);
    setProcessingStage(undefined);
    updateConnectionState({
      isConnected: false,
      isConnecting: false,
      lastHeartbeat: null,
      reconnectAttempts: 0,
      lastError: null
    });
  }, [sessionId, updateConnectionState]);

  return {
    // Message state
    status,
    content,
    latestMessageId,
    processingStage,
    
    // Connection state
    isConnected: connectionState.isConnected,
    isConnecting: connectionState.isConnecting,
    reconnectAttempts: connectionState.reconnectAttempts,
    connectionError: connectionState.lastError,
    lastHeartbeat: connectionState.lastHeartbeat,
    
    // Actions
    reconnect,
    
    // For debugging
    connectionState
  };
}
