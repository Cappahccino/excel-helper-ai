
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';
import { FileProcessingState as UIFileProcessingState } from '@/types/workflowStatus';
import { useFileAssociation } from './useFileAssociation';

export const useFileProcessing = (
  workflowId: string | null, 
  nodeId: string, 
  updateProcessingState: (status: any, progress?: number, message?: string, error?: string) => void,
  enhancedState: any
) => {
  const { associateFileWithWorkflow } = useFileAssociation();

  const processFile = async (fileId: string, onChange?: (nodeId: string, config: any) => void, files?: any[]) => {
    try {
      console.log('Debug - Current workflowId:', workflowId);
      if (workflowId?.startsWith('temp-')) {
        console.log('Debug - This is a temporary workflow ID');
        console.log('Debug - Formatted for DB:', workflowId.substring(5));
      } else {
        console.log('Debug - This is a permanent workflow ID');
      }
      
      console.log('Debug - Current nodeId:', nodeId);
      
      if (!workflowId) {
        updateProcessingState(UIFileProcessingState.Error, 0, 'Error', 'No workflow ID available. Please save the workflow first.');
        toast.error('Cannot associate file with workflow yet. Please save the workflow.');
        return;
      }
      
      console.log(`Associating file ${fileId} with node ${nodeId} in workflow ${workflowId}`);
      
      const { data: fileData, error: fileError } = await supabase
        .from('excel_files')
        .select('id, filename, file_path, file_size, mime_type')
        .eq('id', fileId)
        .single();
        
      if (fileError) {
        console.error('Error fetching file data:', fileError);
        updateProcessingState(UIFileProcessingState.Error, 0, 'Error', `File data error: ${fileError.message}`);
        toast.error('Failed to get file information');
        throw fileError;
      }
      
      if (!fileData || !fileData.file_path) {
        throw new Error('File path is missing or invalid');
      }
      
      console.log(`Downloading file from path: ${fileData.file_path}`);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        updateProcessingState(UIFileProcessingState.Error, 0, 'Error', 'User not authenticated');
        toast.error('You must be logged in to use this feature');
        throw new Error('User not authenticated');
      }
      
      updateProcessingState(UIFileProcessingState.Associating, 30, 'Creating database association...');
      
      try {
        const result = await associateFileWithWorkflow(fileId, workflowId, nodeId);
        if (!result) {
          console.error('File association failed');
          updateProcessingState(UIFileProcessingState.Error, 0, 'Error', 'File association failed');
          toast.error('Failed to associate file with workflow node');
          return;
        }
        
        console.log('File association successful');
      } catch (assocError) {
        console.error('Error in association:', assocError);
        updateProcessingState(UIFileProcessingState.Error, 0, 'Error', `Association error: ${assocError.message || 'Unknown error'}`);
        toast.error('Failed to associate file with workflow node');
        return;
      }
      
      updateProcessingState(UIFileProcessingState.Queuing, 40, 'Submitting for processing...');
      try {
        const response = await supabase.functions.invoke('processFile', {
          body: {
            fileId,
            workflowId,
            nodeId
          }
        });
        
        if (response.error) {
          console.error('Error invoking processFile function:', response.error);
          updateProcessingState(UIFileProcessingState.Error, 0, 'Error', `Processing error: ${response.error.message}`);
          toast.error('Failed to queue file for processing');
          throw response.error;
        }
        
        const responseData = response.data;
        if (responseData && responseData.error) {
          console.error('Process file returned error:', responseData.error);
          updateProcessingState(UIFileProcessingState.Error, 0, 'Error', `Process error: ${responseData.error}`);
          toast.error(responseData.error);
          return;
        }
        
        updateProcessingState(UIFileProcessingState.FetchingSchema, 60, 'Retrieving file schema...');
        
        if (onChange) {
          onChange(nodeId, { 
            fileId, 
            filename: files?.find(f => f.id === fileId)?.filename,
            selectedSheet: undefined
          });
        }
        
        toast.success('File processing started');
        
        setTimeout(() => {
          if (!enhancedState.isComplete && !enhancedState.isError) {
            updateProcessingState(UIFileProcessingState.Verifying, 80, 'Verifying data...');
          }
        }, 2000);
      } catch (fnError) {
        console.error('Function call failed:', fnError);
        updateProcessingState(UIFileProcessingState.Error, 0, 'Error', `API error: ${fnError.message}`);
        toast.error('Error processing file. Please try again.');
      }
    } catch (error) {
      console.error('Error associating file with workflow node:', error);
      toast.error('Failed to associate file with workflow');
      updateProcessingState(UIFileProcessingState.Error, 0, 'Error', `Error: ${error.message}`);
    }
  };

  return {
    processFile
  };
};
