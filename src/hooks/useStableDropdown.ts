
import { useCallback, useState, useRef } from 'react';

interface UseStableDropdownOptions {
  preventNodeSelection?: boolean;
  debounceDelay?: number;
  closeOnOutsideClick?: boolean;
}

/**
 * A hook that provides stable dropdown behavior within React Flow nodes
 * to prevent flickering and handle event propagation correctly
 */
export function useStableDropdown({
  preventNodeSelection = true,
  debounceDelay = 50,
  closeOnOutsideClick = true
}: UseStableDropdownOptions = {}) {
  const [openState, setOpenState] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dropdownClickTimeRef = useRef<number>(0);
  const internalStateRef = useRef<boolean>(false);
  
  // Create a stable handler for opening/closing dropdown
  const handleOpenChange = useCallback((newOpen: boolean) => {
    // Skip if no actual change
    if (newOpen === internalStateRef.current) return;
    
    // Update internal ref immediately to prevent double toggling
    internalStateRef.current = newOpen;
    
    // Update state in the next frame to avoid React batching issues
    setOpenState(newOpen);
    
    // Track click time for dropdown
    if (newOpen) {
      dropdownClickTimeRef.current = Date.now();
    }
  }, []);
  
  // Prevent event bubbling to avoid ReactFlow node selection
  const stopPropagation = useCallback((e: React.SyntheticEvent) => {
    if (preventNodeSelection) {
      e.stopPropagation();
    }
  }, [preventNodeSelection]);
  
  // Prevent selection for specific events (click, mousedown)
  const preventSelection = useCallback((e: React.SyntheticEvent) => {
    if (preventNodeSelection) {
      // Always stop propagation
      e.stopPropagation();
      
      // For mouse events, prevent default behavior
      if (e.type === 'mousedown' || e.type === 'click') {
        e.preventDefault();
      }
    }
  }, [preventNodeSelection]);
  
  return {
    open: openState,
    setOpen: handleOpenChange,
    triggerRef,
    contentRef,
    stopPropagation,
    preventSelection,
    closeDropdown: useCallback(() => handleOpenChange(false), [handleOpenChange]),
    openDropdown: useCallback(() => handleOpenChange(true), [handleOpenChange]),
    dropdownClickTime: dropdownClickTimeRef
  };
}
