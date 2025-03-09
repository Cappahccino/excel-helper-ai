
import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase, isTemporaryWorkflowId } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Hook to generate and manage temporary IDs with session storage persistence
 * and database synchronization
 */
export function useTemporaryId(
  key: string, 
  initialId?: string | null,
  forceTemporary: boolean = false
): [string, (id: string | null) => void] {
  // Track initialization status
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const initAttempts = useRef<number>(0);
  const maxInitAttempts = 3;
  
  // Initialize state from session storage or generate a new ID
  const [id, setIdState] = useState<string>(() => {
    try {
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
      if (typeof window !== 'undefined') {
        const storedId = sessionStorage.getItem(`temp_${key}`);
        if (storedId) {
          console.log(`Retrieved temporary ID from session storage: ${storedId}`);
          return storedId;
        }
      }
      
      // Generate a new temporary ID
      const newId = `temp-${uuidv4()}`;
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(`temp_${key}`, newId);
        } catch (err) {
          console.error('Failed to store temporary ID in session storage:', err);
        }
      }
      console.log(`Generated new temporary ID: ${newId}`);
      return newId;
    } catch (error) {
      console.error('Error initializing temporary ID:', error);
      // Fallback to a new ID if anything fails
      return `temp-${uuidv4()}`;
    }
  });

  // For workflows, ensure the temp ID exists in the database
  useEffect(() => {
    const syncTempIdWithDatabase = async () => {
      // Only sync workflow IDs and only temp IDs
      if (key !== 'workflow' || !id.startsWith('temp-') || !isTemporaryWorkflowId(id)) {
        setIsInitialized(true);
        return;
      }

      try {
        initAttempts.current += 1;
        console.log(`Syncing temporary workflow ID with database (attempt ${initAttempts.current}): ${id}`);
        
        // Check if this temp ID already exists in the database
        const tempUuid = id.substring(5); // Remove 'temp-' prefix
        const { data: existingWorkflow, error: checkError } = await supabase
          .from('workflows')
          .select('id')
          .eq('id', tempUuid)
          .eq('is_temporary', true)
          .maybeSingle();
          
        if (checkError) {
          console.error('Error checking for existing temporary workflow:', checkError);
          
          // Only retry if we haven't exceeded max attempts
          if (initAttempts.current < maxInitAttempts) {
            setTimeout(syncTempIdWithDatabase, 1000 * initAttempts.current);
            return;
          } else {
            console.error('Max initialization attempts reached. Marking as initialized anyway.');
            setIsInitialized(true);
            return;
          }
        }
        
        if (!existingWorkflow) {
          console.log(`Creating new temporary workflow in database: ${id}`);
          
          // Get current user ID
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            console.error('No authenticated user found when creating temporary workflow');
            setIsInitialized(true);
            return;
          }
          
          // Create the temporary workflow entry
          const { error: createError } = await supabase
            .from('workflows')
            .insert({
              id: tempUuid, // Store without 'temp-' prefix in DB
              name: 'New Workflow',
              is_temporary: true,
              status: 'draft',
              trigger_type: 'manual',
              created_by: user.id,
              definition: JSON.stringify({ nodes: [], edges: [] })
            });
            
          if (createError) {
            console.error('Error creating temporary workflow:', createError);
            
            // Only retry if we haven't exceeded max attempts
            if (initAttempts.current < maxInitAttempts) {
              setTimeout(syncTempIdWithDatabase, 1000 * initAttempts.current);
              return;
            }
          } else {
            console.log(`Successfully created temporary workflow in database: ${id}`);
          }
        } else {
          console.log(`Found existing temporary workflow in database: ${id}`);
        }
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Error in syncTempIdWithDatabase:', error);
        setIsInitialized(true);
      }
    };

    if (!isInitialized) {
      syncTempIdWithDatabase();
    }
  }, [id, key, isInitialized]);

  // Custom setter that updates both state and session storage
  const setId = useCallback((newId: string | null) => {
    try {
      if (newId) {
        // Ensure temp IDs have the proper prefix
        const formattedId = isTemporaryWorkflowId(newId) && !newId.startsWith('temp-') 
          ? `temp-${newId}` 
          : newId;
        
        setIdState(formattedId);
        
        // Only store in session if it's a temporary ID
        if (isTemporaryWorkflowId(formattedId) && typeof window !== 'undefined') {
          sessionStorage.setItem(`temp_${key}`, formattedId);
          console.log(`Stored temporary ID in session storage: ${formattedId}`);
        } else if (typeof window !== 'undefined') {
          // If we're setting a permanent ID, remove the temporary one
          sessionStorage.removeItem(`temp_${key}`);
          console.log(`Removed temporary ID from session storage for key ${key}`);
        }
      } else {
        // If null is passed, generate a new temporary ID
        const newTempId = `temp-${uuidv4()}`;
        setIdState(newTempId);
        
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(`temp_${key}`, newTempId);
          console.log(`Generated and stored new temporary ID: ${newTempId}`);
        }
      }
    } catch (error) {
      console.error('Error in setId:', error);
      toast.error('Error managing workflow ID');
    }
  }, [key]);

  return [id, setId];
}
