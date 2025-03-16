
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
      console.log(`Initializing temporary ID for key ${key}, initialId: ${initialId}, forceTemporary: ${forceTemporary}`);
      
      // If initialId is 'new', generate a new temporary ID
      if (initialId === 'new') {
        console.log('Generating new ID for "new" workflow');
        return generateUniqueId(key);
      }
      
      // If initialId is provided and not marked as temporary, use it
      if (initialId && !forceTemporary && !isTemporaryWorkflowId(initialId)) {
        console.log(`Using provided non-temporary ID: ${initialId}`);
        return initialId;
      }
      
      // If initialId is provided and IS marked as temporary, ensure it has temp- prefix
      if (initialId && (forceTemporary || isTemporaryWorkflowId(initialId))) {
        if (!initialId.startsWith('temp-')) {
          const tempId = `temp-${initialId}`;
          console.log(`Converting to temporary ID format: ${tempId}`);
          return tempId;
        }
        console.log(`Using provided temporary ID: ${initialId}`);
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
      
      // Generate a new unique temporary ID
      console.log('Generating new unique temporary ID');
      return generateUniqueId(key);
    } catch (error) {
      console.error('Error initializing temporary ID:', error);
      // Fallback to a new ID if anything fails
      return generateUniqueId(key);
    }
  });

  /**
   * Generate a unique ID that's guaranteed not to conflict with existing IDs
   */
  function generateUniqueId(keyPrefix: string): string {
    const newId = `temp-${uuidv4()}`;
    
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(`temp_${keyPrefix}`, newId);
      } catch (err) {
        console.error('Failed to store temporary ID in session storage:', err);
      }
    }
    
    console.log(`Generated new temporary ID: ${newId}`);
    return newId;
  }

  /**
   * Verify if a temporary ID already exists in the database
   */
  async function checkIdExists(tempId: string): Promise<boolean> {
    if (!tempId.startsWith('temp-')) return false;
    
    try {
      const dbId = convertToDbWorkflowId(tempId);
      
      const { data, error } = await supabase
        .from('workflows')
        .select('id')
        .eq('id', dbId)
        .limit(1);
        
      if (error) {
        console.error('Error checking if ID exists:', error);
        return false;
      }
      
      return data && data.length > 0;
    } catch (err) {
      console.error('Error in checkIdExists:', err);
      return false;
    }
  }

  // For workflows, ensure the temp ID exists in the database immediately
  useEffect(() => {
    // Function to sync temporary ID with the database
    const syncTempIdWithDatabase = async () => {
      // Skip sync for routes that don't need db creation, like /canvas/new
      // Only sync workflow IDs and only temp IDs that are not 'new'
      if (key !== 'workflow' || !id.startsWith('temp-') || id === 'new' || 
          !isTemporaryWorkflowId(id) || syncInProgress.current || isDbSynced) {
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
          .limit(1);
          
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
        
        // If ID already exists but is another user's workflow, generate a new ID
        if (existingWorkflow && existingWorkflow.length > 0) {
          console.log(`ID ${tempUuid} already exists in database, checking if it belongs to current user`);
          
          const { data: workflowData } = await supabase
            .from('workflows')
            .select('created_by')
            .eq('id', tempUuid)
            .single();
            
          if (workflowData && workflowData.created_by !== user.id) {
            console.log(`ID conflict: generating new temporary ID to avoid collision`);
            const newId = generateUniqueId(key);
            setIdState(newId);
            syncInProgress.current = false;
            // Don't set isDbSynced = true here, let the effect run again with the new ID
            return;
          } else {
            console.log(`Found existing temporary workflow in database: ${id}`);
            setIsDbSynced(true);
          }
        } else {
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
            // If creation fails due to uniqueness constraint
            if (createError.code === '23505') { // UNIQUE VIOLATION
              console.log(`Uniqueness violation: generating new temporary ID`);
              const newId = generateUniqueId(key);
              setIdState(newId);
              syncInProgress.current = false;
              // Don't set isDbSynced = true here, let the effect run again with the new ID
              return;
            } else {
              console.error('Error creating temporary workflow:', createError);
              
              // Only retry if we haven't exceeded max attempts
              if (initAttempts.current < maxInitAttempts) {
                setTimeout(() => {
                  syncInProgress.current = false;
                  syncTempIdWithDatabase();
                }, 1000 * initAttempts.current);
                return;
              }
            }
          } else {
            console.log(`Successfully created temporary workflow in database: ${id}`);
            setIsDbSynced(true);
          }
        }
        
        setIsInitialized(true);
        syncInProgress.current = false;
      } catch (error) {
        console.error('Error in syncTempIdWithDatabase:', error);
        syncInProgress.current = false;
        setIsInitialized(true);
      }
    };

    // Don't auto-sync database for /new routes, as they'll create their workflow on save
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const isNewRoute = pathname.endsWith('/new');
    
    if (!isNewRoute) {
      // Run the sync operation immediately when the hook is initialized
      syncTempIdWithDatabase();
    } else {
      console.log('Skipping database sync for /new route - will create on save');
      setIsInitialized(true);
    }
  }, [id, key, isDbSynced]);

  // Custom setter that updates both state and session storage
  const setId = useCallback(async (newId: string | null) => {
    try {
      console.log(`Setting new ID: ${newId}`);
      
      if (newId === 'new') {
        console.log('Converting "new" to a new temporary ID');
        const uniqueId = generateUniqueId(key);
        setIdState(uniqueId);
        
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(`temp_${key}`, uniqueId);
        }
        
        // Reset initialization state to trigger DB sync
        setIsDbSynced(false);
        setIsInitialized(false);
        initAttempts.current = 0;
        return;
      }
      
      if (newId) {
        // Ensure temp IDs have the proper prefix
        const formattedId = isTemporaryWorkflowId(newId) && !newId.startsWith('temp-') 
          ? `temp-${newId}` 
          : newId;
        
        // If it's a temp ID, check if it exists before using it
        if (isTemporaryWorkflowId(formattedId)) {
          const exists = await checkIdExists(formattedId);
          
          if (exists) {
            // Generate a unique ID instead
            console.log(`ID ${formattedId} already exists, generating new one`);
            const uniqueId = generateUniqueId(key);
            setIdState(uniqueId);
            
            if (typeof window !== 'undefined') {
              sessionStorage.setItem(`temp_${key}`, uniqueId);
              console.log(`Stored new temporary ID in session storage: ${uniqueId}`);
            }
          } else {
            setIdState(formattedId);
            
            if (typeof window !== 'undefined') {
              sessionStorage.setItem(`temp_${key}`, formattedId);
              console.log(`Stored temporary ID in session storage: ${formattedId}`);
            }
          }
        } else {
          // For non-temporary IDs
          setIdState(formattedId);
          
          if (typeof window !== 'undefined') {
            // If we're setting a permanent ID, remove the temporary one
            sessionStorage.removeItem(`temp_${key}`);
            console.log(`Removed temporary ID from session storage for key ${key}`);
          }
        }
      } else {
        // If null is passed, generate a new temporary ID
        const newTempId = generateUniqueId(key);
        setIdState(newTempId);
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
