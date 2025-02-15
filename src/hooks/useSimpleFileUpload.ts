
import { useState, useCallback } from "react";
import { validateFile, sanitizeFileName } from "@/utils/fileUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";

interface UseSimpleFileUploadReturn {
  file: File | null;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  handleFileUpload: (file: File) => Promise<void>;
  resetUpload: () => void;
  fileId: string | null;
  setUploadProgress: (progress: number) => void;
}

export const useSimpleFileUpload = (): UseSimpleFileUploadReturn => {
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
      setFile(newFile);
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);
      
      const sanitizedFile = new File([newFile], sanitizeFileName(newFile.name), {
        type: newFile.type,
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      const filePath = `${uuidv4()}-${sanitizedFile.name}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("excel_files")
        .upload(filePath, sanitizedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;
      setUploadProgress(50);

      const { data: fileRecord, error: dbError } = await supabase
        .from("excel_files")
        .insert({
          filename: sanitizedFile.name,
          file_path: filePath,
          file_size: sanitizedFile.size,
          user_id: user.id,
          processing_status: "pending",
        })
        .select()
        .single();

      if (dbError) throw dbError;
      setUploadProgress(100);

      setFileId(fileRecord.id);
      
      toast({
        title: "Success",
        description: "File uploaded successfully",
      });

    } catch (err) {
      console.error("Upload error:", err);
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
  };
};
