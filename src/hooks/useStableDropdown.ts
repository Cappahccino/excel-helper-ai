
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseStableDropdownProps {
  onOpenChange?: (open: boolean) => void;
  preventNodeSelection?: boolean;
  portalToBody?: boolean;
}

export function useStableDropdown({ 
  onOpenChange, 
  preventNodeSelection = true,
  portalToBody = true
}: UseStableDropdownProps = {}) {
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
      // Check if click is inside trigger or content
      if (triggerRef.current?.contains(e.target as Node) || 
          contentRef.current?.contains(e.target as Node)) {
        return;
      }
      
      handleOpenChange(false);
    };

    // Use capture phase to catch events early
    document.addEventListener('mousedown', handleOutsideClick, true);
    
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
    };
  }, [open, handleOpenChange]);
  
  // Prevent node selection only when clicking directly on dropdown elements
  const preventSelection = useCallback((e: React.MouseEvent) => {
    if (preventNodeSelection) {
      e.stopPropagation();
    }
  }, [preventNodeSelection]);
  
  // More granular control for event propagation
  const stopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Handle dropdown item selection with proper event handling
  const handleItemSelect = useCallback((callback?: () => void) => {
    return (e: React.MouseEvent) => {
      // Always stop propagation for item selection
      e.stopPropagation();
      
      // Call the provided callback
      callback?.();
      
      // Close the dropdown
      handleOpenChange(false);
    };
  }, [handleOpenChange]);
  
  return {
    open,
    setOpen: handleOpenChange,
    triggerRef,
    contentRef,
    preventSelection,
    stopPropagation,
    handleItemSelect,
    portalToBody
  };
}
