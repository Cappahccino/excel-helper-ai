
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseStableDropdownProps {
  onOpenChange?: (open: boolean) => void;
  preventNodeSelection?: boolean;
}

export function useStableDropdown({ onOpenChange, preventNodeSelection = true }: UseStableDropdownProps = {}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    onOpenChange?.(newOpen);
  }, [onOpenChange]);
  
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
