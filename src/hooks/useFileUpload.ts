
import { useState, useCallback } from "react";
import { validateFile, sanitizeFileName } from "@/utils/fileUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";

export function useFileUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const { toast } = useToast();

  const resetUpload = useCallback(() => {
    setFiles([]);
    setIsUploading(false);
    setUploadProgress({});
    setError(null);
    setFileIds([]);
  }, []);

  const handleFileUpload = useCallback(async (newFiles: File[]) => {
    try {
      if (newFiles.length === 0) return;
      
      setFiles(newFiles);
      setIsUploading(true);
      setError(null);
      const uploadedFileIds: string[] = [];
      
      // Validate all files first
      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        const validation = validateFile(file);
        if (!validation.isValid) {
          throw new Error(`${file.name}: ${validation.error}`);
        }
        setUploadProgress({ ...uploadProgress, [i]: 0 });
      }
      
      // Get user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      // Upload files
      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        
        // Update progress to 10%
        setUploadProgress(prev => ({ ...prev, [i]: 10 }));
        
        // Sanitize filename
        const sanitizedName = sanitizeFileName(file.name);
        const filePath = `${uuidv4()}-${sanitizedName}`;
        
        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('excel_files')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
          });
        
        if (uploadError) throw uploadError;
        
        // Update progress to 50%
        setUploadProgress(prev => ({ ...prev, [i]: 50 }));
        
        // Create database record
        const { data: fileData, error: dbError } = await supabase
          .from('excel_files')
          .insert({
            filename: sanitizedName,
            file_path: filePath,
            file_size: file.size,
            user_id: user.id,
            processing_status: "completed",
            mime_type: file.type,
            storage_verified: true,
          })
          .select('id')
          .single();
        
        if (dbError) throw dbError;
        
        if (fileData) {
          uploadedFileIds.push(fileData.id);
        }
        
        // Update progress to 100%
        setUploadProgress(prev => ({ ...prev, [i]: 100 }));
      }
      
      setFileIds(uploadedFileIds);
      toast({
        title: "Upload Successful",
        description: `${newFiles.length} ${newFiles.length === 1 ? 'file' : 'files'} uploaded successfully.`,
      });
      
    } catch (error) {
      console.error('Upload error:', error);
      setError(error instanceof Error ? error.message : "Failed to upload files");
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [toast, uploadProgress]);

  return {
    files,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
    error,
    fileIds
  };
}
