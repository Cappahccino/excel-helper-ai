
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
      if (!triggerRef.current?.contains(e.target as Node) && 
          !contentRef.current?.contains(e.target as Node)) {
        handleOpenChange(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [open, handleOpenChange]);
  
  // Prevent node selection when clicking on dropdown elements
  const preventSelection = useCallback((e: React.MouseEvent) => {
    if (preventNodeSelection) {
      e.stopPropagation();
    }
  }, [preventNodeSelection]);
  
  return {
    open,
    setOpen: handleOpenChange,
    triggerRef,
    contentRef,
    preventSelection,
    // Utility method to prevent event propagation
    stopPropagation: (e: React.MouseEvent) => e.stopPropagation()
  };
}
