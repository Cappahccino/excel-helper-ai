
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileSchema } from '@/types/workflow';

/**
 * Hook to subscribe to and fetch file schema data
 * 
 * @param workflowId - The ID of the workflow
 * @param fileId - Optional file ID to filter by
 * @param nodeId - Optional node ID to filter by
 * @returns Object containing file schemas and loading state
 */
export function useFileSchema(workflowId: string, fileId?: string, nodeId?: string) {
  const [fileSchemas, setFileSchemas] = useState<FileSchema[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch file schemas on component mount
  useEffect(() => {
    if (!workflowId) {
      setFileSchemas([]);
      setIsLoading(false);
      return;
    }

    const fetchFileSchemas = async () => {
      try {
        setIsLoading(true);
        let query = supabase
          .from('workflow_file_schemas')
          .select('*')
          .eq('workflow_id', workflowId);
        
        if (fileId) {
          query = query.eq('file_id', fileId);
        }
        
        if (nodeId) {
          query = query.eq('node_id', nodeId);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        setFileSchemas(data as FileSchema[]);
      } catch (err) {
        console.error('Error fetching file schemas:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    fetchFileSchemas();

    // Subscribe to changes in file schemas
    const channel = supabase
      .channel(`schema-changes-${workflowId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workflow_file_schemas',
          filter: `workflow_id=eq.${workflowId}`
        },
        () => {
          // Refetch file schemas when changes occur
          fetchFileSchemas();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflowId, fileId, nodeId]);

  // Function to get a specific file schema
  const getFileSchema = (specificFileId: string, specificNodeId?: string): FileSchema | undefined => {
    if (specificNodeId) {
      return fileSchemas.find(
        schema => schema.fileId === specificFileId && schema.nodeId === specificNodeId
      );
    }
    return fileSchemas.find(schema => schema.fileId === specificFileId);
  };

  return {
    fileSchemas,
    isLoading,
    error,
    getFileSchema
  };
}
