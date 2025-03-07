
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileSchema } from '@/types/workflow';

/**
 * Custom hook for getting and subscribing to file schemas
 * 
 * @param workflowId - ID of the workflow
 * @returns Object containing file schemas and loading state
 */
export function useFileSchema(workflowId?: string) {
  const [fileSchemas, setFileSchemas] = useState<FileSchema[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!workflowId) {
      setFileSchemas([]);
      setIsLoading(false);
      return;
    }

    // Initial fetch of file schemas
    const fetchFileSchemas = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('workflow_file_schemas')
          .select('*')
          .eq('workflow_id', workflowId);

        if (error) throw error;
        setFileSchemas(data as unknown as FileSchema[]);
      } catch (err) {
        console.error('Error fetching file schemas:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    fetchFileSchemas();

    // Set up subscription for real-time updates
    const subscription = supabase
      .channel(`schema-changes-${workflowId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'workflow_file_schemas',
        filter: `workflow_id=eq.${workflowId}`
      }, (payload) => {
        // Update the file schemas based on the change
        if (payload.eventType === 'INSERT') {
          setFileSchemas(prev => [...prev, payload.new as unknown as FileSchema]);
        } else if (payload.eventType === 'UPDATE') {
          setFileSchemas(prev => 
            prev.map(schema => 
              schema.nodeId === (payload.new as any).node_id ? 
                payload.new as unknown as FileSchema : 
                schema
            )
          );
        } else if (payload.eventType === 'DELETE') {
          setFileSchemas(prev => 
            prev.filter(schema => schema.nodeId !== (payload.old as any).node_id)
          );
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [workflowId]);

  const getSchemaForNode = (nodeId: string): FileSchema | undefined => {
    return fileSchemas.find(schema => schema.nodeId === nodeId);
  };

  const getSchemaByFileId = (fileId: string): FileSchema | undefined => {
    return fileSchemas.find(schema => schema.fileId === fileId);
  };

  return {
    fileSchemas,
    isLoading,
    error,
    getSchemaForNode,
    getSchemaByFileId
  };
}
