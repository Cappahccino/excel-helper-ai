
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ExcelFile } from '@/types/files';

export function useFileOperations() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownload = async (file: ExcelFile) => {
    try {
      if (!file.storage_verified) {
        throw new Error("File not available in storage");
      }

      const { data, error } = await supabase.storage
        .from('excel_files')
        .download(file.file_path);

      if (error) throw error;

      await supabase
        .from('excel_files')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('id', file.id);

      const url = window.URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download the file. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (file: ExcelFile) => {
    try {
      const { error: dbError } = await supabase
        .from('excel_files')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', file.id);

      if (dbError) throw dbError;

      toast({
        title: "File Deleted",
        description: "The file has been successfully deleted.",
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete the file. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleChatWithFile = (fileId: string) => {
    navigate(`/chat?fileId=${fileId}`);
  };

  return {
    formatFileSize,
    handleDownload,
    handleDelete,
    handleChatWithFile,
  };
}
