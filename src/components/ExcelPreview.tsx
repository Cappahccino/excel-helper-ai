
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
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const { data: previewData, isLoading, error } = useQuery({
    queryKey: ['excel-preview', file?.name, file?.lastModified, sessionFileId],
    queryFn: async (): Promise<PreviewData> => {
      if (!file && !sessionFileId) {
        throw new Error("No file provided");
      }

      try {
        console.log("Starting Excel preview fetch", { fileProvided: !!file, sessionFileId });
        let data;
        
        if (file) {
          // Direct file processing
          console.log("Processing direct file");
          data = await file.arrayBuffer();
        } else if (sessionFileId) {
          console.log("Processing sessionFileId:", sessionFileId);
          
          // First, try using the preview-file-data endpoint (new method)
          try {
            console.log("Attempting to use preview-file-data endpoint");
            const { data: previewResponse, error: previewError } = await supabase.functions.invoke(
              'preview-file-data',
              {
                body: { fileId: sessionFileId, maxRows: 10 }
              }
            );
            
            if (previewError) {
              console.error("Error from preview-file-data:", previewError);
              throw previewError;
            }
            
            console.log("Preview response:", previewResponse);
            setDebugInfo(previewResponse);
            
            if (previewResponse && previewResponse.data && previewResponse.data.length > 0) {
              // Successfully got data from the preview endpoint
              const headers = previewResponse.columns || Object.keys(previewResponse.data[0] || {});
              
              // Convert objects to arrays for table display
              const rows = previewResponse.data.map((row: any) => {
                return headers.map(header => row[header]);
              });
              
              console.log("Preview data processed successfully", { headers, rowCount: rows.length });
              return { headers, rows };
            }
          } catch (previewEndpointError) {
            console.warn("Failed to use preview-file-data endpoint, falling back to direct file download", previewEndpointError);
          }
          
          // Fallback: Get file from Supabase storage directly
          console.log("Using fallback: direct file download");
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

        // If we have raw file data (ArrayBuffer), process it
        if (data instanceof ArrayBuffer) {
          console.log("Processing raw file data (ArrayBuffer)");
          const workbook = XLSX.read(data);
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (!Array.isArray(jsonData) || jsonData.length === 0) {
            throw new Error("No data found in Excel file");
          }

          const headers = (jsonData[0] || []) as string[];
          const rows = jsonData.slice(1, 11) as any[][]; // Limit to 10 rows

          console.log("Excel file processed successfully", { 
            sheetName: firstSheetName, 
            headers, 
            rowCount: rows.length 
          });
          
          return { headers, rows };
        }

        throw new Error("Failed to process Excel data");
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

  if (error) {
    return (
      <div className="text-center p-4 text-red-500" role="alert">
        <p>Error loading preview: {error instanceof Error ? error.message : 'Unknown error'}</p>
        {debugInfo && (
          <details className="mt-2 text-xs text-left bg-gray-100 p-2 rounded">
            <summary>Debug Info</summary>
            <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
          </details>
        )}
      </div>
    );
  }

  if (!previewData || !previewData.headers || !previewData.rows) {
    return (
      <div className="text-center p-4 text-muted-foreground" role="alert">
        <p>Unable to preview file</p>
        {debugInfo && (
          <details className="mt-2 text-xs text-left bg-gray-100 p-2 rounded">
            <summary>Debug Info</summary>
            <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
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
      {debugInfo && (
        <details className="mt-2 text-xs text-left bg-gray-100 p-2 rounded">
          <summary>Preview Data Debug</summary>
          <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
