
import { useState, useCallback } from "react";
import { validateFile, sanitizeFileName } from "@/utils/fileUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";

interface UseFileUploadReturn {
  file: File | null;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  handleFileUpload: (file: File, sessionId?: string | null) => Promise<void>;
  resetUpload: () => void;
  fileIds: string[]; // Changed from fileId to fileIds
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
  const [fileIds, setFileIds] = useState<string[]>([]); // Changed from fileId to fileIds
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const { toast } = useToast();

  const resetUpload = useCallback(() => {
    setFile(null);
    setIsUploading(false);
    setUploadProgress(0);
    setError(null);
    setFileIds([]); // Reset array instead of null
    setSessionId(null);
    setThreadId(null);
  }, []);

  const calculateFileHash = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  };

  const handleFileUpload = useCallback(async (newFile: File, currentSessionId?: string | null) => {
    try {
      setFile(newFile);
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);
      
      const sanitizedFile = new File([newFile], sanitizeFileName(newFile.name), {
        type: newFile.type,
      });

      const fileHash = await calculateFileHash(sanitizedFile);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { data: existingFiles } = await supabase
        .from('excel_files')
        .select('*')
        .eq('file_hash', fileHash)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle();

      if (existingFiles) {
        toast({
          title: "Duplicate File",
          description: "This file has already been uploaded. Using existing version.",
        });
        setFileIds(prev => [...prev, existingFiles.id]); // Add to array
        setUploadProgress(100);

        if (currentSessionId) {
          await supabase
            .from('chat_sessions')
            .update({ excel_file_id: existingFiles.id })
            .eq('session_id', currentSessionId);
        }
        return;
      }

      const filePath = `${uuidv4()}-${sanitizedFile.name}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, sanitizedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;
      setUploadProgress(50);

      const { data: fileRecord, error: dbError } = await supabase
        .from('excel_files')
        .insert({
          filename: sanitizedFile.name,
          file_path: filePath,
          file_size: sanitizedFile.size,
          user_id: user.id,
          processing_status: "pending",
          mime_type: sanitizedFile.type,
          file_hash: fileHash,
          storage_verified: true,
        })
        .select()
        .single();

      if (dbError) throw dbError;
      
      if (currentSessionId) {
        await supabase
          .from('session_files')
          .insert({
            session_id: currentSessionId,
            file_id: fileRecord.id,
            is_active: true
          });
      }

      setUploadProgress(100);
      setFileIds(prev => [...prev, fileRecord.id]); // Add to array
      setSessionId(currentSessionId);
      
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
    fileIds, // Return array of fileIds
    setUploadProgress,
    sessionId,
    setSessionId,
    threadId,
  };
};
