
import { useState, useCallback } from "react";
import { validateFile, sanitizeFileName } from "@/utils/fileUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

interface UseFileUploadReturn {
  file: File | null;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  handleFileUpload: (file: File) => Promise<void>;
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

  const handleFileUpload = useCallback(async (newFile: File) => {
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
      
      const sanitizedFile = new File([newFile], sanitizeFileName(newFile.name), {
        type: newFile.type,
      });

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Create file path
      const filePath = `${crypto.randomUUID()}-${sanitizedFile.name}`;

      // Upload file to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, sanitizedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Create file record in database
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

      // Initial analysis request
      const { data: analysis, error: analysisError } = await supabase.functions
        .invoke('excel-assistant', {
          body: { 
            fileId: fileRecord.id,
            query: "Please analyze this Excel file and provide a summary of its contents.",
            userId: user.id,
            sessionId: null // This will trigger creation of a new session
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
