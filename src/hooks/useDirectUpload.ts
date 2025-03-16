
import { useState, useCallback } from "react";
import { validateFile, sanitizeFileName } from "@/utils/fileUtils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";
import { FILE_CONFIG } from "@/config/fileConfig";

export function useDirectUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const resetUpload = useCallback(() => {
    setFile(null);
    setIsUploading(false);
    setUploadProgress(0);
    setError(null);
    setFileId(null);
    setIsDragActive(false);
  }, []);

  const handleFileUpload = useCallback(async (files: File[]) => {
    try {
      if (files.length === 0) return null;
      
      // Use only the first file
      const selectedFile = files[0];
      setFile(selectedFile);
      setIsUploading(true);
      setError(null);
      
      // Validate file
      const validation = validateFile(selectedFile);
      if (!validation.isValid) {
        throw new Error(`${selectedFile.name}: ${validation.error}`);
      }
      
      // Update progress to 10%
      setUploadProgress(10);
      
      // Get user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      // Sanitize filename
      const sanitizedName = sanitizeFileName(selectedFile.name);
      const filePath = `${uuidv4()}-${sanitizedName}`;
      
      // Update progress to 20%
      setUploadProgress(20);
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });
      
      if (uploadError) throw uploadError;
      
      // Update progress to 60%
      setUploadProgress(60);
      
      // Create database record
      const { data: fileData, error: dbError } = await supabase
        .from('excel_files')
        .insert({
          filename: sanitizedName,
          file_path: filePath,
          file_size: selectedFile.size,
          user_id: user.id,
          processing_status: "completed",
          mime_type: selectedFile.type,
          storage_verified: true,
        })
        .select('id')
        .single();
      
      if (dbError) throw dbError;
      
      if (fileData) {
        setFileId(fileData.id);
      } else {
        throw new Error("No file ID returned from database");
      }
      
      // Update progress to 100%
      setUploadProgress(100);
      
      toast.success(`File "${sanitizedName}" uploaded successfully`);
      return fileData.id;
      
    } catch (error) {
      console.error('Upload error:', error);
      setError(error instanceof Error ? error.message : "Failed to upload file");
      toast.error(error instanceof Error ? error.message : "Failed to upload file");
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleDragEnter = useCallback(() => {
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragActive(false);
  }, []);

  return {
    file,
    isUploading,
    uploadProgress,
    fileId,
    error,
    handleFileUpload,
    resetUpload,
    isDragActive,
    handleDragEnter,
    handleDragLeave
  };
}
