
import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase, isTemporaryWorkflowId, convertToDbWorkflowId } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Hook to generate and manage temporary IDs with session storage persistence
 * and database initialization for workflows
 */
export function useTemporaryId(
  key: string, 
  initialId?: string | null,
  forceTemporary: boolean = false
): [string, (id: string | null) => void, boolean] {
  // Initialize state from session storage or generate a new ID
  const [id, setIdState] = useState<string>(() => {
    try {
      // If initialId is provided and not marked as temporary, use it
      if (initialId && !forceTemporary && !isTemporaryWorkflowId(initialId)) {
        console.log(`Using provided initialId: ${initialId}`);
        return initialId;
      }
      
      // If initialId is provided and IS marked as temporary, ensure it has temp- prefix
      if (initialId && (forceTemporary || isTemporaryWorkflowId(initialId))) {
        if (!initialId.startsWith('temp-')) {
          const formattedId = `temp-${initialId}`;
          console.log(`Formatted temporary ID: ${formattedId}`);
          return formattedId;
        }
        console.log(`Using provided temporary ID: ${initialId}`);
        return initialId;
      }
      
      // Check if we have a stored temporary ID
      const storedId = sessionStorage.getItem(`temp_${key}`);
      if (storedId) {
        console.log(`Using stored ID from session storage: ${storedId}`);
        return storedId;
      }
      
      // Generate a new temporary ID
      const newId = `temp-${uuidv4()}`;
      console.log(`Generated new temporary ID: ${newId}`);
      sessionStorage.setItem(`temp_${key}`, newId);
      return newId;
    } catch (error) {
      console.error('Error in useTemporaryId initialization:', error);
      // Fallback to a new ID if something goes wrong
      const fallbackId = `temp-${uuidv4()}`;
      console.log(`Using fallback ID due to error: ${fallbackId}`);
      return fallbackId;
    }
  });

  // Track initialization state
  const [isInitialized, setIsInitialized] = useState(false);
  const initAttempts = useRef(0);
  const maxInitAttempts = 3;

  // Initialize workflow in database if needed (for workflows only)
  useEffect(() => {
    if (key !== 'workflow' || !id || !isTemporaryWorkflowId(id) || initAttempts.current >= maxInitAttempts) {
      setIsInitialized(true);
      return;
    }
    
    const createTempWorkflowInDb = async () => {
      try {
        initAttempts.current += 1;
        console.log(`Initializing workflow (attempt ${initAttempts.current}): ${id}`);
        
        // Get current user
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          console.error('Error getting current user:', userError);
          
          if (initAttempts.current >= maxInitAttempts) {
            toast.error('Failed to initialize workflow. Please try refreshing the page.');
            setIsInitialized(true);
          }
          return;
        }
        
        const userId = userData?.user?.id;
        if (!userId) {
          console.error('No user ID available');
          
          if (initAttempts.current >= maxInitAttempts) {
            toast.error('Authentication required. Please sign in again.');
            setIsInitialized(true);
          }
          return;
        }
        
        // Extract UUID from temp ID
        const workflowUuid = convertToDbWorkflowId(id);
        
        // Check if this workflow already exists in the database
        const { data: existingWorkflow, error: checkError } = await supabase
          .from('workflows')
          .select('id')
          .eq('id', workflowUuid)
          .maybeSingle();
        
        if (checkError) {
          console.error('Error checking for existing workflow:', checkError);
          
          if (initAttempts.current >= maxInitAttempts) {
            toast.error('Failed to verify workflow existence. Please try again later.');
            setIsInitialized(true);
          }
          return;
        }
        
        // Only create if it doesn't exist yet
        if (!existingWorkflow) {
          console.log(`Creating temporary workflow in database: ${workflowUuid}`);
          
          const { error: insertError } = await supabase
            .from('workflows')
            .insert({
              id: workflowUuid,
              name: 'New Workflow',
              definition: JSON.stringify({ nodes: [], edges: [] }),
              user_id: userId,
              created_by: userId,
              is_temporary: true
            });
            
          if (insertError) {
            console.error('Error creating temporary workflow:', insertError);
            
            if (initAttempts.current >= maxInitAttempts) {
              toast.error('Failed to create workflow. Please try again later.');
              setIsInitialized(true);
            }
            return;
          }
          
          console.log(`Temporary workflow created successfully: ${workflowUuid}`);
        } else {
          console.log(`Temporary workflow already exists in database: ${workflowUuid}`);
        }
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Error in createTempWorkflowInDb:', error);
        
        if (initAttempts.current >= maxInitAttempts) {
          toast.error('Workflow initialization failed. Please try refreshing the page.');
          setIsInitialized(true);
        }
      }
    };
    
    createTempWorkflowInDb();
  }, [id, key]);

  // Custom setter that updates both state and session storage
  const setId = useCallback((newId: string | null) => {
    try {
      if (newId) {
        // Ensure temp IDs have the proper prefix
        const formattedId = isTemporaryWorkflowId(newId) && !newId.startsWith('temp-') 
          ? `temp-${newId}` 
          : newId;
        
        console.log(`Setting ID to: ${formattedId}`);
        setIdState(formattedId);
        
        // Only store in session if it's a temporary ID
        if (isTemporaryWorkflowId(formattedId)) {
          sessionStorage.setItem(`temp_${key}`, formattedId);
          console.log(`Stored ID in session storage: ${formattedId}`);
        } else {
          // If we're setting a permanent ID, remove the temporary one
          sessionStorage.removeItem(`temp_${key}`);
          console.log(`Removed temporary ID from session storage for key: ${key}`);
        }
      } else {
        // If null is passed, generate a new temporary ID
        const newTempId = `temp-${uuidv4()}`;
        console.log(`Generated new temporary ID: ${newTempId}`);
        setIdState(newTempId);
        sessionStorage.setItem(`temp_${key}`, newTempId);
      }
    } catch (error) {
      console.error('Error in setId:', error);
      toast.error('Error managing workflow ID. Please try refreshing the page.');
    }
  }, [key]);

  return [id, setId, isInitialized];
}
