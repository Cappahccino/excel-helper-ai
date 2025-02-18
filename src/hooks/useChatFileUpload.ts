
import { useState, useCallback } from "react";
import { validateFile, sanitizeFileName } from "@/utils/fileUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";

interface UseChatFileUploadReturn {
  files: File[];
  isUploading: boolean;
  uploadProgress: Record<string, number>;
  error: string | null;
  handleFileUpload: (newFiles: File[], sessionId?: string | null) => Promise<void>;
  resetUpload: () => void;
  fileIds: string[];
  setUploadProgress: (fileId: string, progress: number) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  threadId: string | null;
}

export const useChatFileUpload = (): UseChatFileUploadReturn => {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const { toast } = useToast();

  const resetUpload = useCallback(() => {
    setFiles([]);
    setIsUploading(false);
    setUploadProgress({});
    setError(null);
    setFileIds([]);
    setSessionId(null);
    setThreadId(null);
  }, []);

  const setProgressForFile = (fileId: string, progress: number) => {
    setUploadProgress(prev => ({
      ...prev,
      [fileId]: progress
    }));
  };

  const handleFileUpload = useCallback(async (newFiles: File[], currentSessionId?: string | null) => {
    try {
      setIsUploading(true);
      setError(null);
      const uploadedFileIds: string[] = [];

      // Process files in parallel using Promise.all
      await Promise.all(newFiles.map(async (file) => {
        const validation = validateFile(file);
        if (!validation.isValid) {
          throw new Error(`${file.name}: ${validation.error}`);
        }

        const sanitizedFile = new File([file], sanitizeFileName(file.name), {
          type: file.type,
        });

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error("User not authenticated");
        }

        const filePath = `${uuidv4()}-${sanitizedFile.name}`;
        const tempFileId = uuidv4();

        setProgressForFile(tempFileId, 0);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('excel_files')
          .upload(filePath, sanitizedFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;
        setProgressForFile(tempFileId, 50);

        const { data: fileRecord, error: dbError } = await supabase
          .from('excel_files')
          .insert({
            filename: sanitizedFile.name,
            file_path: filePath,
            file_size: sanitizedFile.size,
            user_id: user.id,
            processing_status: "pending"
          })
          .select()
          .single();

        if (dbError) throw dbError;
        
        uploadedFileIds.push(fileRecord.id);
        setProgressForFile(tempFileId, 100);

        // If we have a session, create the session_files relationship
        if (currentSessionId) {
          const { error: relationError } = await supabase
            .from('session_files')
            .insert({
              session_id: currentSessionId,
              file_id: fileRecord.id,
              is_active: true
            });

          if (relationError) throw relationError;
        }
      }));

      setFileIds(uploadedFileIds);
      setSessionId(currentSessionId);
      
      toast({
        title: "Success",
        description: `${newFiles.length} file(s) uploaded successfully`,
      });

    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : "Failed to upload files");
      toast({
        title: "Upload Failed",
        description: err instanceof Error ? err.message : "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [toast]);

  return {
    files,
    isUploading,
    uploadProgress,
    error,
    handleFileUpload,
    resetUpload,
    fileIds,
    setUploadProgress: setProgressForFile,
    sessionId,
    setSessionId,
    threadId,
  };
};
