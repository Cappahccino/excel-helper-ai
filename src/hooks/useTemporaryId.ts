
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
      return initialId;
    }
    
    // If initialId is provided and IS marked as temporary, ensure it has temp- prefix
    if (initialId && isTemporary) {
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

  // Custom setter that updates both state and session storage
  const setId = (newId: string | null) => {
    if (newId) {
      // Ensure temp IDs have the proper prefix
      const formattedId = newId.startsWith('temp-') ? newId : newId;
      setIdState(formattedId);
      
      // Only store in session if it's a temporary ID
      if (formattedId.startsWith('temp-')) {
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
  };

  return [id, setId];
}
