
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounce } from './useDebounce';

interface UseStableDropdownProps {
  onOpenChange?: (open: boolean) => void;
  preventNodeSelection?: boolean;
  debounceDelay?: number;
}

export function useStableDropdown({ 
  onOpenChange, 
  preventNodeSelection = true,
  debounceDelay = 50 
}: UseStableDropdownProps = {}) {
  const [open, setOpenState] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Debounce the open state changes to reduce flickering
  const debouncedOpen = useDebounce(open, debounceDelay);
  
  useEffect(() => {
    onOpenChange?.(debouncedOpen);
  }, [debouncedOpen, onOpenChange]);
  
  // Controlled handler for open state
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen === open) return; // Skip if no change
    setOpenState(newOpen);
  }, [open]);
  
  // Handle outside clicks to close the dropdown
  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (e: MouseEvent) => {
      // Only close if clicking outside both the trigger and content
      if (!triggerRef.current?.contains(e.target as Node) && 
          !contentRef.current?.contains(e.target as Node)) {
        handleOpenChange(false);
      }
    };

    // Use mousedown for better interaction with ReactFlow
    document.addEventListener('mousedown', handleOutsideClick);
    
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [open, handleOpenChange]);
  
  // This function now takes the correct event type and doesn't use stopPropagation by default
  const preventSelection = useCallback((e: React.SyntheticEvent) => {
    if (preventNodeSelection) {
      // Only prevent default, don't stop propagation by default
      e.preventDefault();
    }
  }, [preventNodeSelection]);
  
  return {
    open,
    setOpen: handleOpenChange,
    triggerRef,
    contentRef,
    preventSelection,
    // More controlled stopPropagation function - explicitly stops propagation only when needed
    stopPropagation: (e: React.SyntheticEvent) => {
      e.stopPropagation();
      e.preventDefault();
    }
  };
}
