
import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

/**
 * Hook to generate and manage temporary IDs with session storage persistence
 */
export function useTemporaryId(
  key: string, 
  initialId?: string | null,
  isTemporary: boolean = false
): [string, (id: string | null) => void] {
  // Initialize state from session storage or generate a new ID
  const [id, setIdState] = useState<string>(() => {
    // If initialId is provided and not marked as temporary, use it
    if (initialId && !isTemporary) {
      console.log(`Using provided permanent ID: ${initialId}`);
      return initialId;
    }
    
    // If initialId is provided but marked as temporary, use it directly
    if (initialId && isTemporary && initialId.startsWith('temp-')) {
      console.log(`Using provided temporary ID: ${initialId}`);
      return initialId;
    }
    
    // Check if we have a stored temporary ID
    try {
      const storedId = sessionStorage.getItem(`temp_${key}`);
      if (storedId) {
        console.log(`Retrieved temporary ID from session storage: ${storedId}`);
        return storedId;
      }
    } catch (error) {
      console.error('Error accessing sessionStorage:', error);
    }
    
    // Generate a new temporary ID
    const newId = `temp-${uuidv4()}`;
    console.log(`Generated new temporary ID: ${newId}`);
    
    try {
      sessionStorage.setItem(`temp_${key}`, newId);
    } catch (error) {
      console.error('Error saving to sessionStorage:', error);
    }
    
    return newId;
  });

  // Custom setter that updates both state and session storage
  const setId = (newId: string | null) => {
    console.log(`Setting ID for ${key} to:`, newId);
    
    if (newId) {
      setIdState(newId);
      
      try {
        // Only store in session if it's a temporary ID
        if (newId.startsWith('temp-')) {
          console.log(`Storing temporary ID in session storage: ${newId}`);
          sessionStorage.setItem(`temp_${key}`, newId);
        } else {
          // If we're setting a permanent ID, remove the temporary one
          console.log(`Removing temporary ID from session storage for key: temp_${key}`);
          sessionStorage.removeItem(`temp_${key}`);
        }
      } catch (error) {
        console.error('Error updating sessionStorage:', error);
      }
    } else {
      // If null is passed, generate a new temporary ID
      const newTempId = `temp-${uuidv4()}`;
      console.log(`Generated new replacement temporary ID: ${newTempId}`);
      setIdState(newTempId);
      
      try {
        sessionStorage.setItem(`temp_${key}`, newTempId);
      } catch (error) {
        console.error('Error saving new temporary ID to sessionStorage:', error);
      }
    }
  };

  return [id, setId];
}
