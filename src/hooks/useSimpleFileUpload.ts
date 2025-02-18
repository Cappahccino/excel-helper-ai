
import { useState, useCallback } from 'react';
import { validateFile } from '@/utils/fileUtils';
import { useToast } from '@/hooks/use-toast';

export function useSimpleFileUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const { toast } = useToast();

  const handleFileUpload = useCallback(async (newFiles: File[]) => {
    try {
      setIsUploading(true);
      setFiles(newFiles);
      
      // Validate each file
      for (const file of newFiles) {
        const validation = validateFile(file);
        if (!validation.isValid) {
          throw new Error(`${file.name}: ${validation.error}`);
        }
        // Simulate upload progress for each file
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: 0
        }));
      }

      // Simulate upload progress
      for (const file of newFiles) {
        await new Promise<void>(resolve => {
          let progress = 0;
          const interval = setInterval(() => {
            progress += 10;
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: progress
            }));
            if (progress >= 100) {
              clearInterval(interval);
              resolve();
            }
          }, 100);
        });
      }

      toast({
        title: 'Success',
        description: `${newFiles.length} file(s) uploaded successfully`,
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload file',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  }, [toast]);

  const resetUpload = useCallback(() => {
    setFiles([]);
    setUploadProgress({});
    setIsUploading(false);
  }, []);

  return {
    files,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
  };
}
