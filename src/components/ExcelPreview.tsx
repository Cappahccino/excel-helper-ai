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

interface ExcelPreviewProps {
  file: File;
}

interface PreviewData {
  headers: string[];
  rows: any[][];
}

export function ExcelPreview({ file }: ExcelPreviewProps) {
  const { toast } = useToast();

  const { data: previewData, isLoading } = useQuery({
    queryKey: ['excel-preview', file.name, file.lastModified],
    queryFn: async (): Promise<PreviewData> => {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const headers = jsonData[0] as string[];
      const rows = jsonData.slice(1, 21) as any[][]; // Limit to 20 rows

      return { headers, rows };
    },
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    cacheTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4" role="status">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel" aria-label="Loading"></div>
      </div>
    );
  }

  if (!previewData) {
    return (
      <div className="text-center p-4 text-muted-foreground" role="alert">
        Unable to preview file
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 flex justify-between items-center border-b">
        <h3 className="font-semibold">Preview: {file.name}</h3>
        <span className="text-sm text-muted-foreground">First 20 rows</span>
      </div>
      <div className="overflow-x-auto">
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
  );
}