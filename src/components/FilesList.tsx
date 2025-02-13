
import { formatDistanceToNow } from 'date-fns';
import { FileSpreadsheet, Download, Trash2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ExcelFile {
  id: string;
  filename: string;
  file_size: number;
  created_at: string;
  file_path: string;
}

interface FilesListProps {
  files: ExcelFile[];
  isLoading: boolean;
}

export function FilesList({ files, isLoading }: FilesListProps) {
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
      const { data, error } = await supabase.storage
        .from('excel_files')
        .download(file.file_path);

      if (error) throw error;

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
      const { error: storageError } = await supabase.storage
        .from('excel_files')
        .remove([file.file_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('excel_files')
        .delete()
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg border border-gray-200">
        <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-sm font-medium text-gray-900">No files</h3>
        <p className="mt-1 text-sm text-gray-500">Upload a file to get started</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>File</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file) => (
            <TableRow key={file.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="font-medium">{file.filename}</span>
                </div>
              </TableCell>
              <TableCell>{formatFileSize(file.file_size)}</TableCell>
              <TableCell>
                {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleChatWithFile(file.id)}
                    className="text-gray-600 hover:text-gray-900"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span className="sr-only">Chat with file</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(file)}
                    className="text-gray-600 hover:text-gray-900"
                  >
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download file</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(file)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete file</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
