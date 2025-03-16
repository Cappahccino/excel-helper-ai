
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
  // Use state with a ref to track the "real" value to avoid race conditions
  const [open, setOpenState] = useState(false);
  const internalStateRef = useRef(open);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mouseDownInsideRef = useRef(false);
  const dropdownClickTimeRef = useRef(0);
  
  // Debounce the open state changes to reduce flickering
  const debouncedOpen = useDebounce(open, debounceDelay);
  
  // Keep internal state ref in sync with actual state
  useEffect(() => {
    internalStateRef.current = open;
  }, [open]);
  
  // Notify parent of open state changes using the debounced value
  useEffect(() => {
    if (onOpenChange) {
      onOpenChange(debouncedOpen);
    }
  }, [debouncedOpen, onOpenChange]);
  
  // Controlled handler for open state that works with the ref for stability
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen === internalStateRef.current) return; // Skip if no change using ref
    
    // Use RAF to avoid flickering due to React's batching
    requestAnimationFrame(() => {
      internalStateRef.current = newOpen; // Update ref immediately
      setOpenState(newOpen); // Update state (will trigger re-render)
      
      // Track timestamp of dropdown click to help with click coordination
      if (newOpen) {
        dropdownClickTimeRef.current = Date.now();
      }
    });
  }, []);
  
  // Enhanced outside click detection using mousedown/mouseup pattern
  useEffect(() => {
    if (!closeOnOutsideClick) return;

    const handleMouseDown = (e: MouseEvent) => {
      // Track if mousedown happened inside our elements
      mouseDownInsideRef.current = 
        !!triggerRef.current?.contains(e.target as Node) || 
        !!contentRef.current?.contains(e.target as Node);
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Only close if both mousedown and mouseup happened outside
      if (!mouseDownInsideRef.current && 
          !triggerRef.current?.contains(e.target as Node) && 
          !contentRef.current?.contains(e.target as Node)) {
        
        // Add a small delay to avoid race conditions with click events
        const timeSinceOpen = Date.now() - dropdownClickTimeRef.current;
        if (internalStateRef.current && timeSinceOpen > 50) {
          handleOpenChange(false);
        }
      }
      // Reset the flag for next interaction
      mouseDownInsideRef.current = false;
    };

    document.addEventListener('mousedown', handleMouseDown, { capture: true });
    document.addEventListener('mouseup', handleMouseUp, { capture: true });
    
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, { capture: true });
      document.removeEventListener('mouseup', handleMouseUp, { capture: true });
    };
  }, [closeOnOutsideClick, handleOpenChange]);
  
  // Enhanced event handling to prevent React Flow node selection
  const preventSelection = useCallback((e: React.SyntheticEvent) => {
    if (preventNodeSelection) {
      // Use stopPropagation to prevent the event from reaching React Flow
      e.stopPropagation(); 
      
      // For mouse events, we want to ensure the dropdown control is prioritized
      if (e.type === 'mousedown' || e.type === 'click') {
        e.preventDefault();
      }
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
