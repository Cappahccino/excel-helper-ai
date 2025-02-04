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
}

export const useFileUpload = (): UseFileUploadReturn => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const { toast } = useToast();

  const resetUpload = useCallback(() => {
    setFile(null);
    setIsUploading(false);
    setUploadProgress(0);
    setError(null);
    setFileId(null);
  }, []);

  const uploadChunk = async (
    chunk: Blob,
    chunkIndex: number,
    totalChunks: number,
    filePath: string
  ) => {
    const { error: uploadError } = await supabase.storage
      .from('excel_files')
      .upload(`${filePath}_chunk_${chunkIndex}`, chunk, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;
    
    const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
    setUploadProgress(progress);
  };

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

      // Calculate total chunks
      const totalChunks = Math.ceil(sanitizedFile.size / CHUNK_SIZE);
      const filePath = `${crypto.randomUUID()}-${sanitizedFile.name}`;

      // Create file record in database with initial status
      const { data: fileRecord, error: dbError } = await supabase
        .from('excel_files')
        .insert({
          filename: sanitizedFile.name,
          file_path: filePath,
          file_size: sanitizedFile.size,
          user_id: user.id,
          processing_status: 'uploading',
          total_chunks: totalChunks,
          processed_chunks: 0,
          upload_progress: 0
        })
        .select()
        .single();

      if (dbError) throw dbError;
      setFileId(fileRecord.id);

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, sanitizedFile.size);
        const chunk = sanitizedFile.slice(start, end);
        
        await uploadChunk(chunk, i, totalChunks, filePath);

        // Update progress in database
        const { error: updateError } = await supabase
          .from('excel_files')
          .update({
            processed_chunks: i + 1,
            upload_progress: Math.round(((i + 1) / totalChunks) * 100)
          })
          .eq('id', fileRecord.id);

        if (updateError) throw updateError;
      }

      // Update file status to processing
      const { error: statusError } = await supabase
        .from('excel_files')
        .update({
          processing_status: 'processing',
          processing_started_at: new Date().toISOString()
        })
        .eq('id', fileRecord.id);

      if (statusError) throw statusError;

      setFile(sanitizedFile);
      toast({
        title: "Success",
        description: "File uploaded successfully",
      });

    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : "Failed to upload file");
      toast({
        title: "Upload Failed",
        description: err instanceof Error ? err.message : "Failed to upload file",
        variant: "destructive",
      });

      // Update error status in database if we have a fileId
      if (fileId) {
        await supabase
          .from('excel_files')
          .update({
            processing_status: 'error',
            error_message: err instanceof Error ? err.message : "Failed to upload file"
          })
          .eq('id', fileId);
      }
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
  };
};