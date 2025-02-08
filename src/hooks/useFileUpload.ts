
import { useState, useCallback } from "react";
import { validateFile, sanitizeFileName } from "@/utils/fileUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface UseFileUploadReturn {
  file: File | null;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  handleFileUpload: (file: File, sessionId?: string | null) => Promise<void>;
  resetUpload: () => void;
  fileId: string | null;
  setUploadProgress: (progress: number) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  threadId: string | null;
}

export const useFileUpload = (): UseFileUploadReturn => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const { toast } = useToast();

  const resetUpload = useCallback(() => {
    setFile(null);
    setIsUploading(false);
    setUploadProgress(0);
    setError(null);
    setFileId(null);
    setSessionId(null);
    setThreadId(null);
  }, []);

  const handleFileUpload = useCallback(async (newFile: File, currentSessionId?: string | null) => {
    const validation = validateFile(newFile);
    if (!validation.isValid) {
      setError(validation.error);
      toast({
        title: "Upload Error",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);
      
      const sanitizedFile = new File([newFile], sanitizeFileName(newFile.name), {
        type: newFile.type,
      });

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Create unique file path with user ID for proper RLS
      const filePath = `${user.id}/${crypto.randomUUID()}-${sanitizedFile.name}`;

      // Create a Blob from the file to track upload progress
      const blob = new Blob([await sanitizedFile.arrayBuffer()]);
      const size = blob.size;
      let uploaded = 0;

      // Upload file to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, blob, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Set progress to 100% when upload is complete
      setUploadProgress(100);

      // Create file record in database
      const { data: fileRecord, error: dbError } = await supabase
        .from('excel_files')
        .insert({
          filename: sanitizedFile.name,
          file_path: filePath,
          file_size: sanitizedFile.size,
          user_id: user.id,
          processing_status: "processing",
          session_id: currentSessionId || null
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Initial analysis request
      const { data: analysis, error: analysisError } = await supabase.functions
        .invoke('excel-assistant', {
          body: { 
            fileId: fileRecord.id,
            query: "Please analyze this Excel file and provide a summary of its contents.",
            userId: user.id
          }
        });

      if (analysisError) throw analysisError;

      setFileId(fileRecord.id);
      setSessionId(analysis.sessionId);
      setThreadId(analysis.threadId);
      setFile(sanitizedFile);
      
      toast({
        title: "Success",
        description: "File uploaded and analysis started",
      });

    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : "Failed to upload file");
      toast({
        title: "Upload Failed",
        description: err instanceof Error ? err.message : "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [toast]);

  return {
    file,
    isUploading,
    uploadProgress,
    error,
    handleFileUpload,
    resetUpload,
    fileId,
    setUploadProgress,
    sessionId,
    setSessionId,
    threadId,
  };
};
