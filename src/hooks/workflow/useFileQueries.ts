
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';

export const useFileQueries = (workflowId: string | null, nodeId: string, selectedFileId?: string, selectedSheet?: string) => {
  // Query to fetch all files
  const { 
    data: files, 
    isLoading: isLoadingFiles, 
    refetch 
  } = useQuery({
    queryKey: ['excel-files-for-workflow'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('excel_files')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load files');
        throw error;
      }

      return data || [];
    },
  });

  // Query to fetch information about the selected file
  const { 
    data: selectedFile, 
    isLoading: isLoadingSelectedFile 
  } = useQuery({
    queryKey: ['excel-file-info', selectedFileId],
    queryFn: async () => {
      if (!selectedFileId) return null;

      const { data, error } = await supabase
        .from('excel_files')
        .select('*, file_metadata(*)')
        .eq('id', selectedFileId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching file info:', error);
        return null;
      }

      return data;
    },
    enabled: !!selectedFileId,
  });

  // Query to fetch schema for the selected sheet
  const { 
    data: sheetSchema, 
    isLoading: isLoadingSheetSchema 
  } = useQuery({
    queryKey: ['sheet-schema', workflowId, nodeId, selectedSheet],
    queryFn: async () => {
      if (!workflowId || !nodeId || !selectedSheet) return null;
      
      try {
        const dbWorkflowId = convertToDbWorkflowId(workflowId);
        
        console.log(`Fetching schema for node ${nodeId}, sheet ${selectedSheet}`);
        
        const { data, error } = await supabase
          .from('workflow_file_schemas')
          .select('columns, data_types, sample_data')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', nodeId)
          .eq('sheet_name', selectedSheet)
          .maybeSingle();
          
        if (error) {
          console.error('Error fetching sheet schema:', error);
          return null;
        }
        
        if (!data) {
          console.log(`No schema found for sheet ${selectedSheet}. This is normal for newly selected sheets.`);
        } else {
          console.log(`Found schema for sheet ${selectedSheet} with ${data.columns.length} columns`);
        }
        
        return data;
      } catch (error) {
        console.error('Error in sheet schema query:', error);
        return null;
      }
    },
    enabled: !!workflowId && !!nodeId && !!selectedSheet,
  });

  return {
    files,
    isLoadingFiles,
    refetch,
    selectedFile,
    isLoadingSelectedFile,
    sheetSchema,
    isLoadingSheetSchema
  };
};
