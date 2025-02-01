import { useState, useCallback } from "react";
import { validateFile, sanitizeFileName } from "@/utils/fileUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface UseFileUploadState {
  file: File | null;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  fileId: string | null;
}

export function useFileUpload() {
  const [state, setState] = useState<UseFileUploadState>({
    file: null,
    isUploading: false,
    uploadProgress: 0,
    error: null,
    fileId: null
  });
  const { toast } = useToast();

  const resetUpload = useCallback(() => {
    setState({
      file: null,
      isUploading: false,
      uploadProgress: 0,
      error: null,
      fileId: null
    });
  }, []);

  const handleFileUpload = useCallback(async (newFile: File) => {
    const validation = validateFile(newFile);
    if (!validation.isValid) {
      setState(prev => ({ ...prev, error: validation.error }));
      toast({
        title: "Upload Error",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    try {
      setState(prev => ({
        ...prev,
        isUploading: true,
        error: null
      }));

      const sanitizedFile = new File([newFile], sanitizeFileName(newFile.name), {
        type: newFile.type,
      });

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      const filePath = `${crypto.randomUUID()}-${sanitizedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, sanitizedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: fileRecord, error: dbError } = await supabase
        .from('excel_files')
        .insert({
          filename: sanitizedFile.name,
          file_path: filePath,
          file_size: sanitizedFile.size,
          user_id: user.id,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setState(prev => ({
        ...prev,
        file: sanitizedFile,
        fileId: fileRecord.id,
        uploadProgress: 100
      }));

      toast({
        title: "Success",
        description: "File uploaded successfully",
      });
    } catch (err) {
      console.error('Upload error:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to upload file"
      }));
      toast({
        title: "Upload Failed",
        description: err instanceof Error ? err.message : "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setState(prev => ({ ...prev, isUploading: false }));
    }
  }, [toast]);

  return {
    ...state,
    handleFileUpload,
    resetUpload,
  };
}