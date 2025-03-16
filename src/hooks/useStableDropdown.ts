import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounce } from './useDebounce';

interface UseStableDropdownProps {
  onOpenChange?: (open: boolean) => void;
  preventNodeSelection?: boolean;
  debounceDelay?: number;
  closeOnOutsideClick?: boolean;
}

export function useStableDropdown({ 
  onOpenChange, 
  preventNodeSelection = true,
  debounceDelay = 50,
  closeOnOutsideClick = true
}: UseStableDropdownProps = {}) {
  const [open, setOpenState] = useState(false);
  const internalStateRef = useRef(open);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mouseDownInsideRef = useRef(false);
  
  // Debounce the open state changes to reduce flickering
  const debouncedOpen = useDebounce(open, debounceDelay);
  
  // Keep internal state ref in sync with actual state
  useEffect(() => {
    internalStateRef.current = open;
  }, [open]);
  
  useEffect(() => {
    if (onOpenChange) {
      onOpenChange(debouncedOpen);
    }
  }, [debouncedOpen, onOpenChange]);
  
  // Controlled handler for open state
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen === internalStateRef.current) return; // Skip if no change using ref
    internalStateRef.current = newOpen; // Update ref immediately
    setOpenState(newOpen); // Update state (will trigger re-render)
  }, []);
  
  // Handle outside clicks to close the dropdown
  useEffect(() => {
    if (!closeOnOutsideClick) return;

    const handleMouseDown = (e: MouseEvent) => {
      mouseDownInsideRef.current = 
        !!triggerRef.current?.contains(e.target as Node) || 
        !!contentRef.current?.contains(e.target as Node);
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Only close if both mousedown and mouseup happened outside
      if (!mouseDownInsideRef.current && 
          !triggerRef.current?.contains(e.target as Node) && 
          !contentRef.current?.contains(e.target as Node)) {
        if (internalStateRef.current) {
          handleOpenChange(false);
        }
      }
      // Reset the flag for next interaction
      mouseDownInsideRef.current = false;
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [closeOnOutsideClick, handleOpenChange]);
  
  // Enhanced event handling to prevent React Flow node selection
  const preventSelection = useCallback((e: React.SyntheticEvent) => {
    if (preventNodeSelection) {
      e.stopPropagation(); // Stop propagation to prevent React Flow node selection
      e.preventDefault();   // Prevent default browser behavior
    }
  }, [preventNodeSelection]);
  
  return {
    open,
    setOpen: handleOpenChange,
    triggerRef,
    contentRef,
    preventSelection,
    stopPropagation: (e: React.SyntheticEvent) => {
      e.stopPropagation();
      e.preventDefault();
    }
  };
}
