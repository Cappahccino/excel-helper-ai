
import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';

interface UseSchemaLoadingProps {
  nodeId: string;
  workflowId?: string;
  onChange?: (nodeId: string, config: any) => void;
  onSchemaLoad?: (schema: SchemaColumn[]) => void;
}

export function useSchemaLoading({ 
  nodeId, 
  workflowId, 
  onChange, 
  onSchemaLoad 
}: UseSchemaLoadingProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<SchemaColumn[]>([]);

  const debouncedSetColumns = useDebounce((newColumns: SchemaColumn[]) => {
    setColumns(newColumns);
    onSchemaLoad?.(newColumns);
  }, 300);

  const updateColumns = useCallback((newColumns: SchemaColumn[]) => {
    if (!Array.isArray(newColumns)) {
      console.error('Invalid schema format received:', newColumns);
      setError('Invalid schema format received');
      return;
    }

    debouncedSetColumns(newColumns);
  }, [debouncedSetColumns]);

  useEffect(() => {
    if (!workflowId || !nodeId) return;

    const loadSchema = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Simulate schema loading - replace this with your actual schema loading logic
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // For now, return empty array - you'll implement actual loading logic
        updateColumns([]);
      } catch (err) {
        console.error('Error loading schema:', err);
        setError('Failed to load schema');
        toast.error('Failed to load schema information');
      } finally {
        setIsLoading(false);
      }
    };

    loadSchema();
  }, [nodeId, workflowId, updateColumns]);

  return {
    columns,
    isLoading,
    error,
    updateColumns
  };
}
