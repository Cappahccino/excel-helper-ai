import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { FileSpreadsheet, X, Maximize2, Table } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExcelPreview } from "./ExcelPreview";
import { motion } from "framer-motion";

interface ExcelThumbnailProps {
  fileId: string;
  filename: string;
  messageId?: string;
  compact?: boolean;
}

export function ExcelThumbnail({ fileId, filename, messageId, compact = true }: ExcelThumbnailProps) {
  const [showPreview, setShowPreview] = useState(false);

  // Fetch thumbnail data
  const { data: thumbnailData, isLoading } = useQuery({
    queryKey: ['excel-thumbnail', fileId],
    queryFn: async () => {
      try {
        // First get file info from database
        const { data: fileRecord } = await supabase
          .from('excel_files')
          .select('file_path')
          .eq('id', fileId)
          .single();

        if (!fileRecord) throw new Error("File not found");

        // Download file from storage
        const { data: fileData, error } = await supabase.storage
          .from('excel_files')
          .download(fileRecord.file_path);

        if (error) throw error;
        
        // Parse Excel file to get preview data
        const buffer = await fileData.arrayBuffer();
        const workbook = XLSX.read(buffer);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Get the first 5 rows for thumbnail preview
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (!Array.isArray(jsonData) || jsonData.length === 0) {
          throw new Error("No data found in Excel file");
        }
        
        const headers = (jsonData[0] || []) as string[];
        const rows = jsonData.slice(1, Math.min(5, jsonData.length)) as any[][];
        
        // Get sheet dimensions for data overview
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        const totalRows = range.e.r + 1;
        const totalCols = range.e.c + 1;
        
        return { 
          headers, 
          rows,
          sheetName: firstSheetName,
          totalRows,
          totalCols,
          sheetCount: workbook.SheetNames.length
        };
      } catch (error) {
        console.error("Error generating Excel thumbnail:", error);
        return null;
      }
    },
    enabled: !!fileId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="bg-[#f5faff] border border-[#d0e3ff] rounded-lg p-2 my-2 w-full max-w-xl">
        <div className="flex items-center gap-2 mb-2">
          <FileSpreadsheet className="w-4 h-4 text-[#217346]" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </div>
    );
  }

  if (!thumbnailData) {
    return (
      <div className="bg-[#f5faff] border border-[#d0e3ff] rounded-lg p-3 my-2 w-full max-w-xl">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-[#217346]" />
          <span className="text-sm font-medium truncate">{filename}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Excel preview unavailable
        </p>
      </div>
    );
  }

  // For compact view, show just the file info and stats
  if (compact) {
    return (
      <Dialog>
        <motion.div 
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#f5faff] border border-[#d0e3ff] hover:border-[#a4c4f4] rounded-lg p-3 my-2 w-full max-w-xl cursor-pointer transition-all duration-150"
        >
          <DialogTrigger className="w-full text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#217346]" />
                <span className="text-sm font-medium truncate">{filename}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs bg-[#e0edff] px-2 py-0.5 rounded-full text-[#2563eb]">
                  {thumbnailData.sheetCount} {thumbnailData.sheetCount === 1 ? 'sheet' : 'sheets'}
                </span>
                <Maximize2 className="w-3.5 h-3.5 text-gray-500" />
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-xs text-gray-600">
                <span className="font-medium">{thumbnailData.totalRows.toLocaleString()}</span> rows
              </span>
              <span className="text-xs text-gray-600">
                <span className="font-medium">{thumbnailData.totalCols.toLocaleString()}</span> columns
              </span>
              <span className="text-xs text-gray-600">
                Sheet: <span className="font-medium">{thumbnailData.sheetName}</span>
              </span>
            </div>
          </DialogTrigger>
        </motion.div>
        
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#217346]" />
                {filename}
              </DialogTitle>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 overflow-auto">
            <ExcelPreview sessionFileId={fileId} />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    );
  }

  // For expanded view, show a mini preview of the data
  return (
    <Dialog>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-[#f5faff] border border-[#d0e3ff] rounded-lg p-3 my-2 w-full max-w-3xl"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#217346]" />
            <span className="text-sm font-medium truncate">{filename}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-[#e0edff] px-2 py-0.5 rounded-full text-[#2563eb]">
              {thumbnailData.sheetCount} {thumbnailData.sheetCount === 1 ? 'sheet' : 'sheets'}
            </span>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className="bg-[#D3E4FD] hover:bg-[#D3E4FD]/90 text-black border-[#C8C8C9] h-7 text-xs flex items-center gap-1.5"
              >
                <Table className="w-3.5 h-3.5" />
                View Full Data
              </Button>
            </DialogTrigger>
          </div>
        </div>
        
        {/* Mini data preview */}
        <div className="overflow-x-auto border border-gray-200 rounded-md max-h-[150px] bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {thumbnailData.headers.slice(0, 5).map((header, index) => (
                  <th key={index} className="px-2 py-1.5 text-left font-medium text-gray-600 border-b truncate max-w-[120px]">
                    {header || `Column ${index + 1}`}
                  </th>
                ))}
                {thumbnailData.headers.length > 5 && (
                  <th className="px-2 py-1.5 text-left font-medium text-gray-500 border-b">
                    +{thumbnailData.headers.length - 5} more
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {thumbnailData.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-gray-50/50' : 'bg-white'}>
                  {row.slice(0, 5).map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-2 py-1 border-b text-gray-800 truncate max-w-[120px]">
                      {cell?.toString() || "-"}
                    </td>
                  ))}
                  {thumbnailData.headers.length > 5 && (
                    <td className="px-2 py-1 border-b text-gray-400">
                      ...
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
          <span>Total: <span className="font-medium">{thumbnailData.totalRows.toLocaleString()}</span> rows × <span className="font-medium">{thumbnailData.totalCols.toLocaleString()}</span> columns</span>
          <span>Sheet: <span className="font-medium">{thumbnailData.sheetName}</span></span>
        </div>
      </motion.div>
      
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#217346]" />
              {filename}
            </DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>
        <ScrollArea className="flex-1 overflow-auto">
          <ExcelPreview sessionFileId={fileId} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}