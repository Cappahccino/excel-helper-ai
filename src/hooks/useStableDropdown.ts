
import { useState, useRef, useEffect, MouseEvent } from 'react';

/**
 * A hook for managing stable dropdown behavior in React Flow nodes
 * Prevents event propagation to React Flow and handles outside clicks correctly
 */
export function useStableDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Handle document clicks to close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    
    const handleDocumentClick = (e: MouseEvent | any) => {
      // Skip if the dropdown hasn't been rendered yet
      if (!dropdownRef.current) return;
      
      // Don't close if clicking inside the dropdown or on the trigger
      if (
        dropdownRef.current.contains(e.target) || 
        triggerRef.current?.contains(e.target)
      ) {
        return;
      }
      
      setIsOpen(false);
    };
    
    // Add listener with capture to get events before React Flow
    document.addEventListener('mousedown', handleDocumentClick, true);
    
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick, true);
    };
  }, [isOpen]);

  // Prevent React Flow from capturing events
  const stopPropagation = (e: MouseEvent) => {
    e.stopPropagation();
  };

  // Toggle dropdown open/closed
  const toggleDropdown = (e: MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  // Close dropdown
  const closeDropdown = () => {
    setIsOpen(false);
  };

  return {
    isOpen,
    setIsOpen,
    stopPropagation,
    toggleDropdown,
    closeDropdown,
    dropdownRef,
    triggerRef,
  };
}
