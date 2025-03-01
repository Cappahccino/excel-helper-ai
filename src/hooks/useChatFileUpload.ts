import { useState, useCallback, useRef, useEffect } from "react";
import { validateFile, sanitizeFileName } from "@/utils/fileUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";

interface FileUploadState {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  fileId?: string;
}

interface UseChatFileUploadReturn {
  files: File[];
  isUploading: boolean;
  uploadProgress: Record<string, number>;
  uploadState: FileUploadState[];
  error: string | null;
  handleFileUpload: (newFiles: File[], sessionId?: string | null) => Promise<void>;
  handleFileSelect: () => void;
  cancelUpload: (fileId: string) => void;
  resetUpload: () => void;
  fileIds: string[];
  setUploadProgress: (fileId: string, progress: number) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  threadId: string | null;
  retryUpload: (fileId: string) => Promise<void>;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export const useChatFileUpload = (): UseChatFileUploadReturn => {
  // State for files and upload process
  const [files, setFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<FileUploadState[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  
  // Create a ref for the file input
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadsInProgress = useRef<Map<string, boolean>>(new Map());
  
  const { toast } = useToast();

  // Clean up uploads map on unmount
  useEffect(() => {
    return () => {
      uploadsInProgress.current.clear();
    };
  }, []);

  // Reset all upload state
  const resetUpload = useCallback(() => {
    setFiles([]);
    setUploadState([]);
    setIsUploading(false);
    setUploadProgress({});
    setError(null);
    setFileIds([]);
    
    // Don't reset sessionId and threadId here as they may be needed
    // even after uploads are reset
    
    // Clear all in-progress uploads
    uploadsInProgress.current.clear();
  }, []);

  // Set progress for a specific file
  const setProgressForFile = useCallback((fileId: string, progress: number) => {
    setUploadProgress(prev => ({
      ...prev,
      [fileId]: progress
    }));
    
    setUploadState(prev => 
      prev.map(state => 
        state.id === fileId 
          ? { ...state, progress } 
          : state
      )
    );
  }, []);

  // Calculate file hash for deduplication
  const calculateFileHash = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('Error calculating file hash:', error);
      // Fallback to a simple hash using file properties
      return `${file.name}-${file.size}-${file.lastModified}`;
    }
  };

  // Function to check for duplicate files by hash
  const checkDuplicateFile = async (fileHash: string, userId: string): Promise<string | null> => {
    try {
      const { data: existingFile } = await supabase
        .from('excel_files')
        .select('id')
        .eq('file_hash', fileHash)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();
        
      return existingFile?.id || null;
    } catch (error) {
      console.error('Error checking for duplicate file:', error);
      return null;
    }
  };

  // Function to trigger file input click
  const handleFileSelect = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  // Function to cancel an ongoing upload
  const cancelUpload = useCallback((fileId: string) => {
    // Mark as not in progress
    uploadsInProgress.current.delete(fileId);
    
    // Remove from state
    setUploadState(prev => prev.filter(state => state.id !== fileId));
    setFiles(prev => prev.filter(f => 
      !prev.find(state => state.id === fileId && state.file.name === f.name)
    ));
    setUploadProgress(prev => {
      const { [fileId]: _, ...rest } = prev;
      return rest;
    });
    
    // Remove from fileIds if it exists
    setFileIds(prev => {
      const stateItem = uploadState.find(state => state.id === fileId);
      if (stateItem?.fileId) {
        return prev.filter(id => id !== stateItem.fileId);
      }
      return prev;
    });
    
    toast({
      title: "Upload Cancelled",
      description: "File upload has been cancelled."
    });
  }, [toast, uploadState]);

  // Function to retry a failed upload
  const retryUpload = useCallback(async (fileId: string) => {
    const stateItem = uploadState.find(state => state.id === fileId);
    if (!stateItem) return;
    
    // Reset the state for this file
    setUploadState(prev => prev.map(state => 
      state.id === fileId 
        ? { ...state, status: 'pending', progress: 0, error: undefined }
        : state
    ));
    
    // Try to upload again
    try {
      const file = stateItem.file;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      // Update status to uploading
      setUploadState(prev => prev.map(state => 
        state.id === fileId ? { ...state, status: 'uploading' } : state
      ));
      
      // Process the file
      await processFileUpload(file, user.id, fileId, sessionId);
      
      toast({
        title: "Upload Successful",
        description: `${file.name} uploaded successfully.`
      });
    } catch (error) {
      console.error(`Retry upload failed for file ${fileId}:`, error);
      
      setUploadState(prev => prev.map(state => 
        state.id === fileId 
          ? { 
              ...state, 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Unknown error' 
            } 
          : state
      ));
      
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    }
  }, [uploadState, sessionId, toast]);

  // Core function to process a single file upload
  const processFileUpload = async (
    file: File, 
    userId: string, 
    stateId: string,
    currentSessionId?: string | null
  ): Promise<string> => {
    // Track this upload
    uploadsInProgress.current.set(stateId, true);
    
    try {
      // Sanitize filename
      const sanitizedFile = new File([file], sanitizeFileName(file.name), {
        type: file.type,
      });
      
      // Calculate hash for deduplication
      const fileHash = await calculateFileHash(sanitizedFile);
      
      // Check for duplicate
      const existingFileId = await checkDuplicateFile(fileHash, userId);
      if (existingFileId) {
        console.log(`Using existing file ${existingFileId} (duplicate detected)`);
        
        // Update progress to complete
        setProgressForFile(stateId, 100);
        
        // Update state
        setUploadState(prev => prev.map(state => 
          state.id === stateId 
            ? { ...state, status: 'completed', fileId: existingFileId } 
            : state
        ));
        
        // Add to fileIds
        setFileIds(prev => [...prev, existingFileId]);
        
        // If there's a session, create the association
        if (currentSessionId) {
          await createSessionFileAssociation(currentSessionId, existingFileId);
        }
        
        return existingFileId;
      }
      
      // Generate unique path
      const filePath = `${uuidv4()}-${sanitizedFile.name}`;
      
      // Start at 0%
      setProgressForFile(stateId, 0);
      
      // Upload to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('excel_files')
        .upload(filePath, sanitizedFile, {
          cacheControl: '3600',
          upsert: false,
          onUploadProgress: (progress) => {
            // Calculate upload percentage
            const percentage = Math.round((progress.loaded / progress.total) * 50);
            setProgressForFile(stateId, percentage);
          }
        });

      if (uploadError) throw uploadError;
      
      // Upload complete, now at 50%
      setProgressForFile(stateId, 50);
      
      // Update state to processing
      setUploadState(prev => prev.map(state => 
        state.id === stateId ? { ...state, status: 'processing' } : state
      ));
      
      // Create database record
      const { data: fileRecord, error: dbError } = await supabase
        .from('excel_files')
        .insert({
          filename: sanitizedFile.name,
          file_path: filePath,
          file_size: sanitizedFile.size,
          user_id: userId,
          processing_status: "pending",
          mime_type: sanitizedFile.type,
          file_hash: fileHash,
          storage_verified: true,
        })
        .select()
        .single();

      if (dbError) throw dbError;
      
      // File record created, now at 75%
      setProgressForFile(stateId, 75);
      
      // If there's a session, create the association
      if (currentSessionId) {
        await createSessionFileAssociation(currentSessionId, fileRecord.id);
      }
      
      // Process complete
      setProgressForFile(stateId, 100);
      
      // Update state
      setUploadState(prev => prev.map(state => 
        state.id === stateId 
          ? { ...state, status: 'completed', fileId: fileRecord.id } 
          : state
      ));
      
      // Add to fileIds
      setFileIds(prev => [...prev, fileRecord.id]);
      
      return fileRecord.id;
    } finally {
      // Clean up tracking
      uploadsInProgress.current.delete(stateId);
    }
  };

  // Helper to create session file association
  const createSessionFileAssociation = async (sessionId: string, fileId: string) => {
    try {
      const { error: sessionError } = await supabase
        .from('session_files')
        .upsert({
          session_id: sessionId,
          file_id: fileId,
          is_active: true
        }, {
          onConflict: 'session_id,file_id'
        });

      if (sessionError) {
        console.error('Error creating session file association:', sessionError);
      }
    } catch (error) {
      console.error('Error in createSessionFileAssociation:', error);
    }
  };

  // Main function to handle file uploads
  const handleFileUpload = useCallback(async (newFiles: File[], currentSessionId?: string | null) => {
    try {
      setIsUploading(true);
      setError(null);
      
      // Create upload state for new files
      const newUploadStates: FileUploadState[] = newFiles.map(file => ({
        id: uuidv4(),
        file,
        progress: 0,
        status: 'pending'
      }));
      
      // Add to state
      setFiles(prev => [...prev, ...newFiles]);
      setUploadState(prev => [...prev, ...newUploadStates]);
      
      // Verify the auth user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      // Run file validation on all files first
      for (const file of newFiles) {
        const validation = validateFile(file);
        if (!validation.isValid) {
          throw new Error(`${file.name}: ${validation.error}`);
        }
      }
      
      // Process files in parallel
      const uploadPromises = newUploadStates.map(state => 
        processFileUpload(state.file, user.id, state.id, currentSessionId)
      );
      
      // Wait for all uploads to complete
      await Promise.allSettled(uploadPromises);
      
      // Count successful uploads
      const successCount = uploadState.filter(state => state.status === 'completed').length;
      
      // Show toast for results
      if (successCount === newFiles.length) {
        toast({
          title: "Success",
          description: `${newFiles.length} file(s) uploaded successfully`,
        });
      } else if (successCount > 0) {
        toast({
          title: "Partial Success",
          description: `${successCount} of ${newFiles.length} files uploaded successfully. Check failed uploads and retry if needed.`,
        });
      } else {
        toast({
          title: "Upload Failed",
          description: "All file uploads failed. Please try again.",
          variant: "destructive",
        });
      }

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
  }, [toast, setProgressForFile, uploadState]);

  return {
    files,
    isUploading,
    uploadProgress,
    uploadState,
    error,
    handleFileUpload,
    handleFileSelect,
    cancelUpload,
    resetUpload,
    fileIds,
    setUploadProgress: setProgressForFile,
    sessionId,
    setSessionId,
    threadId,
    retryUpload,
    fileInputRef
  };
};
