
import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase, isTemporaryWorkflowId, convertToDbWorkflowId } from '@/integrations/supabase/client';
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
  const [isDbSynced, setIsDbSynced] = useState<boolean>(false);
  const initAttempts = useRef<number>(0);
  const maxInitAttempts = 3;
  const syncInProgress = useRef<boolean>(false);
  
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

  // For workflows, ensure the temp ID exists in the database immediately
  useEffect(() => {
    // Function to sync temporary ID with the database
    const syncTempIdWithDatabase = async () => {
      // Only sync workflow IDs and only temp IDs
      if (key !== 'workflow' || !id.startsWith('temp-') || !isTemporaryWorkflowId(id) || syncInProgress.current || isDbSynced) {
        setIsInitialized(true);
        return;
      }

      try {
        // Mark sync as in progress to prevent multiple simultaneous attempts
        syncInProgress.current = true;
        initAttempts.current += 1;
        console.log(`Syncing temporary workflow ID with database (attempt ${initAttempts.current}): ${id}`);
        
        // Get current user ID
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          console.error('No authenticated user found when creating temporary workflow:', userError);
          
          // Only retry if we haven't exceeded max attempts
          if (initAttempts.current < maxInitAttempts) {
            setTimeout(() => {
              syncInProgress.current = false;
              syncTempIdWithDatabase();
            }, 1000 * initAttempts.current);
            return;
          } else {
            console.error('Max initialization attempts reached. Marking as initialized anyway.');
            setIsInitialized(true);
            syncInProgress.current = false;
            return;
          }
        }
        
        // Check if this temp ID already exists in the database
        const tempUuid = convertToDbWorkflowId(id);
        console.log(`Checking for existing workflow with ID: ${tempUuid}`);
        
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
            setTimeout(() => {
              syncInProgress.current = false;
              syncTempIdWithDatabase();
            }, 1000 * initAttempts.current);
            return;
          } else {
            console.error('Max initialization attempts reached. Marking as initialized anyway.');
            setIsInitialized(true);
            syncInProgress.current = false;
            return;
          }
        }
        
        if (!existingWorkflow) {
          console.log(`Creating new temporary workflow in database: ${id}`);
          
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
              setTimeout(() => {
                syncInProgress.current = false;
                syncTempIdWithDatabase();
              }, 1000 * initAttempts.current);
              return;
            }
          } else {
            console.log(`Successfully created temporary workflow in database: ${id}`);
            setIsDbSynced(true);
          }
        } else {
          console.log(`Found existing temporary workflow in database: ${id}`);
          setIsDbSynced(true);
        }
        
        setIsInitialized(true);
        syncInProgress.current = false;
      } catch (error) {
        console.error('Error in syncTempIdWithDatabase:', error);
        syncInProgress.current = false;
        setIsInitialized(true);
      }
    };

    // Run the sync operation immediately when the hook is initialized
    syncTempIdWithDatabase();
  }, [id, key, isDbSynced]);

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

      // Reset initialization state to trigger DB sync for new ID
      if (key === 'workflow') {
        setIsDbSynced(false);
        setIsInitialized(false);
        initAttempts.current = 0;
      }
    } catch (error) {
      console.error('Error in setId:', error);
      toast.error('Error managing workflow ID');
    }
  }, [key]);

  return [id, setId];
}
