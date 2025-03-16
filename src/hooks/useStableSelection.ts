
import { useRef, useCallback, useEffect, useMemo } from 'react';

interface StableSelectionOptions {
  nodeId: string;
  preventBubbling?: boolean;
  selectionDelay?: number;
}

/**
 * Hook to handle node selection in a stable way, preventing flickering
 * during selection and dropdown operations
 */
export function useStableSelection({
  nodeId,
  preventBubbling = true,
  selectionDelay = 0
}: StableSelectionOptions) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const lastClickTime = useRef<number>(0);
  const isSelected = useRef<boolean>(false);
  
  // Create a stable event handler with memoization
  const handleContainerClick = useCallback((e: MouseEvent) => {
    // Skip handling if the target has data-no-capture attribute
    if ((e.target as HTMLElement).getAttribute('data-no-capture') === 'true') {
      return;
    }
    
    // Avoid handling the same click multiple times or handling too rapidly
    const now = Date.now();
    if (now - lastClickTime.current < 150) {
      e.stopPropagation();
      return;
    }
    lastClickTime.current = now;
    
    // Only handle clicks directly on the container, not on children with specific data attributes
    if (e.currentTarget === nodeRef.current && preventBubbling) {
      // Stop event propagation to prevent React Flow from handling it
      e.stopPropagation();
    }
  }, [preventBubbling]);

  // Create a memoized version of the preventClick function
  const preventClick = useMemo(() => {
    return (e: React.MouseEvent | React.SyntheticEvent) => {
      if (preventBubbling) {
        // Skip for elements with data-no-capture
        if ((e.target as HTMLElement).getAttribute('data-no-capture') === 'true') {
          return;
        }
        e.stopPropagation();
      }
    };
  }, [preventBubbling]);

  // Attach and clean up event listeners
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    
    // Add explicit click handler
    node.addEventListener('click', handleContainerClick);
    
    return () => {
      node.removeEventListener('click', handleContainerClick);
    };
  }, [handleContainerClick]);

  return {
    nodeRef,
    preventClick,
    isSelected
  };
}
