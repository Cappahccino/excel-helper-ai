import { useState, useCallback } from "react";
import { validateFile, sanitizeFileName } from "@/utils/fileUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

      // Upload file to Supabase Storage
      const filePath = `${crypto.randomUUID()}-${sanitizedFile.name}`;
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
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setFile(sanitizedFile);
      setFileId(fileRecord.id);
      setUploadProgress(100);

      // Save initial system message
      const initialPrompt = "What kind of data does this Excel file contain? Please, Give me an overview of this Excel file's contents";
      const { error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          content: initialPrompt,
          excel_file_id: fileRecord.id,
          is_ai_response: false,
          user_id: user.id
        });

      if (messageError) throw messageError;

      // Get initial analysis
      const { data: analysis, error: analysisError } = await supabase.functions
        .invoke('analyze-excel', {
          body: { fileId: fileRecord.id, query: initialPrompt }
        });

      if (analysisError) throw analysisError;

      // Save AI response - Fixed to use the correct property name
      const { error: aiMessageError } = await supabase
        .from('chat_messages')
        .insert({
          content: analysis.generatedText || "Unable to analyze file", // Use generatedText and provide fallback
          excel_file_id: fileRecord.id,
          is_ai_response: true,
          user_id: user.id
        });

      if (aiMessageError) throw aiMessageError;

      toast({
        title: "Success",
        description: "File uploaded and analyzed successfully",
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
  };
};