
import { FileUploadZone } from "@/components/FileUploadZone";
import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ChatProps {
  sessionId?: string;
  onSessionCreate?: (sessionId: string) => void;
}

export function Chat({ sessionId, onSessionCreate }: ChatProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [files, setFiles] = useState<File[]>([]);
  const { toast } = useToast();

  const handleFileUpload = useCallback(async (newFiles: File[]) => {
    try {
      setIsUploading(true);
      setFiles(newFiles);
      
      for (const file of newFiles) {
        const fileKey = file.name;
        setUploadProgress(prev => ({ ...prev, [fileKey]: 0 }));
        
        // Simulate upload progress
        await new Promise<void>(resolve => {
          let progress = 0;
          const interval = setInterval(() => {
            progress += 10;
            setUploadProgress(prev => ({
              ...prev,
              [fileKey]: progress
            }));
            if (progress >= 100) {
              clearInterval(interval);
              resolve();
            }
          }, 100);
        });
      }

      toast({
        title: "Success",
        description: `${newFiles.length} file(s) uploaded successfully`,
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [toast]);

  const resetUpload = useCallback(() => {
    setFiles([]);
    setUploadProgress({});
    setIsUploading(false);
  }, []);

  const handleUploadComplete = useCallback(async () => {
    // Add any additional logic needed after upload completes
    console.log('Upload completed');
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <FileUploadZone
        onFileUpload={handleFileUpload}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        currentFiles={files}
        onReset={resetUpload}
        onUploadComplete={handleUploadComplete}
      />
    </div>
  );
}
