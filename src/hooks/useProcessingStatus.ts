
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export type ProcessingStatus = "pending" | "uploading" | "processing" | "analyzing" | "completed" | "error";

interface FileStatus {
  processing_status: ProcessingStatus;
  error_message: string | null;
}

export const useProcessingStatus = (fileId: string | null) => {
  const { toast } = useToast();

  const { data: fileStatus, refetch } = useQuery<FileStatus>({
    queryKey: ["file-status", fileId],
    queryFn: async () => {
      if (!fileId) return null;
      
      const { data, error } = await supabase
        .from("excel_files")
        .select("processing_status, error_message")
        .eq("id", fileId)
        .maybeSingle();

      if (error) throw error;
      return data as FileStatus;
    },
    enabled: !!fileId,
    refetchInterval: (query) => {
      const status = query.state.data?.processing_status;
      return status && ["pending", "uploading", "processing", "analyzing"].includes(status)
        ? 2000  // Poll every 2 seconds while processing
        : false; // Stop polling when complete or error
    },
  });

  // Subscribe to real-time updates with proper cleanup
  useEffect(() => {
    if (!fileId) return;

    // Create the channel with a unique name based on fileId
    const channelName = `excel_files_${fileId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: "*",
          schema: "public",
          table: "excel_files",
          filter: `id=eq.${fileId}`,
        },
        async (payload) => {
          const newStatus = payload.new as FileStatus;
          
          // Show toast for completed processing
          if (newStatus.processing_status === "completed") {
            toast({
              title: "Processing Complete",
              description: "Your Excel file has been processed successfully.",
            });
          }

          // Show toast for errors
          if (newStatus.processing_status === "error") {
            toast({
              title: "Processing Error",
              description: newStatus.error_message || "An error occurred while processing your file.",
              variant: "destructive",
            });
          }

          await refetch();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to updates for file ${fileId}`);
        }
      });

    // Cleanup function
    return () => {
      console.log(`Unsubscribing from updates for file ${fileId}`);
      // First unsubscribe from the channel
      channel.unsubscribe().then(() => {
        // Then remove the channel completely
        supabase.removeChannel(channel);
      });
    };
  }, [fileId, toast, refetch]);

  return {
    status: fileStatus?.processing_status || "pending",
    error: fileStatus?.error_message,
    isProcessing: fileStatus?.processing_status && ["pending", "uploading", "processing", "analyzing"].includes(fileStatus.processing_status),
  };
};
