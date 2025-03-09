
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase, isTemporaryWorkflowId } from '@/integrations/supabase/client';
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
    // If initialId is provided and not marked as temporary, use it
    if (initialId && !forceTemporary && !isTemporaryWorkflowId(initialId)) {
      return initialId;
    }
    
    // If initialId is provided and IS marked as temporary, ensure it has temp- prefix
    if (initialId && (forceTemporary || isTemporaryWorkflowId(initialId))) {
      if (!initialId.startsWith('temp-')) {
        return `temp-${initialId}`;
      }
      return initialId;
    }
    
    // Check if we have a stored temporary ID
    const storedId = sessionStorage.getItem(`temp_${key}`);
    if (storedId) {
      return storedId;
    }
    
    // Generate a new temporary ID
    const newId = `temp-${uuidv4()}`;
    sessionStorage.setItem(`temp_${key}`, newId);
    return newId;
  });

  // Track initialization state
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize workflow in database if needed (for workflows only)
  useEffect(() => {
    if (key !== 'workflow' || !id || !isTemporaryWorkflowId(id)) {
      setIsInitialized(true);
      return;
    }
    
    const createTempWorkflowInDb = async () => {
      try {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) {
          setIsInitialized(true);
          return;
        }
        
        // Extract UUID from temp ID
        const workflowUuid = id.startsWith('temp-') ? id.substring(5) : id;
        
        // Check if this workflow already exists in the database
        const { data: existingWorkflow, error: checkError } = await supabase
          .from('workflows')
          .select('id')
          .eq('id', workflowUuid)
          .maybeSingle();
        
        if (checkError) {
          console.error('Error checking for existing workflow:', checkError);
          setIsInitialized(true);
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
          }
        } else {
          console.log(`Temporary workflow already exists in database: ${workflowUuid}`);
        }
      } catch (error) {
        console.error('Error in createTempWorkflowInDb:', error);
      } finally {
        setIsInitialized(true);
      }
    };
    
    createTempWorkflowInDb();
  }, [id, key]);

  // Custom setter that updates both state and session storage
  const setId = useCallback((newId: string | null) => {
    if (newId) {
      // Ensure temp IDs have the proper prefix
      const formattedId = isTemporaryWorkflowId(newId) ? newId : newId;
      setIdState(formattedId);
      
      // Only store in session if it's a temporary ID
      if (isTemporaryWorkflowId(formattedId)) {
        sessionStorage.setItem(`temp_${key}`, formattedId);
      } else {
        // If we're setting a permanent ID, remove the temporary one
        sessionStorage.removeItem(`temp_${key}`);
      }
    } else {
      // If null is passed, generate a new temporary ID
      const newTempId = `temp-${uuidv4()}`;
      setIdState(newTempId);
      sessionStorage.setItem(`temp_${key}`, newTempId);
    }
  }, [key]);

  return [id, setId, isInitialized];
}
