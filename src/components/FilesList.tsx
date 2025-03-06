import { FileListTable } from './files/FileListTable';
import { FileListPagination } from './files/FileListPagination';
import { EmptyFilesList } from './files/EmptyFilesList';
import { useFileOperations } from './files/useFileOperations';
import { ExcelFile } from '@/types/files';
import { FileSpreadsheet, Download, Trash2, MessageSquare, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { ExcelPreviewModal } from './files/ExcelPreviewModal';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import {
  ColumnDef,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';

interface FilesListProps {
  files: ExcelFile[];
  isLoading: boolean;
  selectedFiles: string[];
  onSelectionChange: (selectedFiles: string[]) => void;
}

interface SheetData {
  name: string;
  headers: string[];
  rows: any[][];
}

interface FilePreview {
  id: string;
  filename: string;
  sheets: SheetData[];
}

export function FilesList({ files, isLoading, selectedFiles, onSelectionChange }: FilesListProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const queryClient = useQueryClient();
  const { handleDownload, handleDelete, handleChatWithFile, formatFileSize } = useFileOperations({ queryClient });

  const { data: previewData } = useQuery({
    queryKey: ['excel-preview', selectedFiles],
    queryFn: async () => {
      if (!selectedFiles.length) return [];

      const previews = await Promise.all(
        selectedFiles.map(async (fileId) => {
          const file = files.find(f => f.id === fileId);
          if (!file) return null;

          try {
            const { data: fileRecord } = await supabase
              .from('excel_files')
              .select('file_path')
              .eq('id', fileId)
              .single();

            if (!fileRecord) throw new Error("File not found");

            const { data: fileData, error } = await supabase.storage
              .from('excel_files')
              .download(fileRecord.file_path);

            if (error) throw error;

            const workbook = XLSX.read(await fileData.arrayBuffer());
            
            const sheets = workbook.SheetNames.map(sheetName => {
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
              
              if (!jsonData.length) return null;

              const headers = (jsonData[0] || []) as string[];
              const rows = jsonData.slice(1) as any[][];

              return {
                name: sheetName,
                headers,
                rows
              };
            }).filter(Boolean);

            return {
              id: fileId,
              filename: file.filename,
              sheets
            };
          } catch (error) {
            console.error('Error processing file:', error);
            return null;
          }
        })
      );

      return previews.filter(Boolean) as FilePreview[];
    },
    enabled: selectedFiles.length > 0
  });

  const columns: ColumnDef<ExcelFile>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
              ? "indeterminate"
              : false
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    },
    {
      header: "File",
      accessorKey: "filename",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5 text-green-500 flex-shrink-0" />
          <span className="font-medium">{row.getValue("filename")}</span>
        </div>
      ),
    },
    {
      header: "Size",
      accessorKey: "file_size",
      cell: ({ row }) => formatFileSize(row.getValue("file_size")),
    },
    {
      header: "Uploaded",
      accessorKey: "created_at",
      cell: ({ row }) => formatDistanceToNow(new Date(row.getValue("created_at")), { addSuffix: true }),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleChatWithFile(row.original.id)}
            className="text-gray-600 hover:text-gray-900"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="sr-only">Chat with file</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPreviewOpen(true)}
            disabled={!selectedFiles.includes(row.original.id)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Eye className="h-4 w-4" />
            <span className="sr-only">Preview file</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDownload(row.original)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Download className="h-4 w-4" />
            <span className="sr-only">Download file</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(row.original)}
            className="text-red-600 hover:text-red-900"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete file</span>
          </Button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: files,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
    getRowId: (row) => row.id,
    state: {
      rowSelection: Object.fromEntries(selectedFiles.map(id => [id, true])),
    },
    onRowSelectionChange: (updater) => {
      if (typeof updater === 'function') {
        const currentSelection = Object.fromEntries(selectedFiles.map(id => [id, true]));
        const newSelection = updater(currentSelection);
        const selectedIds = Object.entries(newSelection)
          .filter(([_, selected]) => selected)
          .map(([id]) => id);
        
        // Validate that we only have valid UUIDs
        const validUUIDs = selectedIds.filter(id => 
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
        );
        onSelectionChange(validUUIDs);
      }
    },
    initialState: {
      pagination: {
        pageSize: 6,
      },
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
      </div>
    );
  }

  if (files.length === 0) {
    return <EmptyFilesList />;
  }

  return (
    <div className="space-y-4">
      <FileListTable table={table} columns={columns} />
      <FileListPagination table={table} />
      {isPreviewOpen && previewData && (
        <ExcelPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          files={previewData}
        />
      )}
    </div>
  );
}
