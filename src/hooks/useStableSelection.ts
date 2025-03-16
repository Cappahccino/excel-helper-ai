
import { useRef, useCallback, useEffect } from 'react';

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
  
  // Create a stable event handler
  const handleContainerClick = useCallback((e: MouseEvent) => {
    // Avoid handling the same click multiple times
    const now = Date.now();
    if (now - lastClickTime.current < 100) {
      return;
    }
    lastClickTime.current = now;
    
    // Only handle clicks directly on the container, not on children
    if (e.currentTarget === nodeRef.current && preventBubbling) {
      // Stop event propagation to prevent React Flow from handling it
      e.stopPropagation();
    }
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
    preventClick: useCallback((e: React.MouseEvent | React.SyntheticEvent) => {
      if (preventBubbling) {
        e.stopPropagation();
      }
    }, [preventBubbling])
  };
}
