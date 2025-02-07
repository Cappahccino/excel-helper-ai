
import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ExcelPreviewProps {
  file?: File | null;
  sessionFileId?: string;
}

interface PreviewData {
  headers: string[];
  rows: any[][];
}

export function ExcelPreview({ file, sessionFileId }: ExcelPreviewProps) {
  const { toast } = useToast();

  const { data: previewData, isLoading } = useQuery({
    queryKey: ['excel-preview', file?.name, file?.lastModified, sessionFileId],
    queryFn: async (): Promise<PreviewData> => {
      if (!file && !sessionFileId) {
        throw new Error("No file provided");
      }

      try {
        let data;
        if (file) {
          data = await file.arrayBuffer();
        } else if (sessionFileId) {
          // Get file from Supabase storage
          const { data: fileRecord } = await supabase
            .from('excel_files')
            .select('file_path')
            .eq('id', sessionFileId)
            .single();

          if (!fileRecord) throw new Error("File not found");

          const { data: fileData, error } = await supabase.storage
            .from('excel_files')
            .download(fileRecord.file_path);

          if (error) throw error;
          data = await fileData.arrayBuffer();
        }

        const workbook = XLSX.read(data);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!Array.isArray(jsonData) || jsonData.length === 0) {
          throw new Error("No data found in Excel file");
        }

        const headers = (jsonData[0] || []) as string[];
        const rows = jsonData.slice(1, 21) as any[][]; // Limit to 20 rows

        return { headers, rows };
      } catch (error) {
        console.error("Error reading Excel file:", error);
        toast({
          title: "Error",
          description: "Failed to read Excel file. Please make sure it's a valid Excel document.",
          variant: "destructive",
        });
        throw error;
      }
    },
    enabled: !!(file || sessionFileId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  if (!file && !sessionFileId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4" role="status">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel" aria-label="Loading"></div>
      </div>
    );
  }

  if (!previewData || !previewData.headers || !previewData.rows) {
    return (
      <div className="text-center p-4 text-muted-foreground" role="alert">
        Unable to preview file
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 flex justify-between items-center border-b">
        <h3 className="font-semibold">Preview: {file?.name}</h3>
        <span className="text-sm text-muted-foreground">First 20 rows</span>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          <Table>
            <TableHeader>
              <TableRow>
                {previewData.headers.map((header, index) => (
                  <TableHead key={index} className="whitespace-nowrap">
                    {header || `Column ${index + 1}`}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewData.rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} className="truncate max-w-[200px]">
                      {cell?.toString() || "-"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
