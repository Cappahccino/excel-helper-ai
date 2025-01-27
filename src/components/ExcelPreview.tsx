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
import { ScrollArea } from "@/components/ui/scroll-area";

interface ExcelPreviewProps {
  file: File;
}

export function ExcelPreview({ file }: ExcelPreviewProps) {
  const [previewData, setPreviewData] = useState<{
    headers: string[];
    rows: any[][];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const readExcel = async () => {
      try {
        setLoading(true);
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Extract headers (first row) and data rows
        const headers = jsonData[0] as string[];
        const rows = jsonData.slice(1, 21) as any[][]; // Limit to 20 rows

        setPreviewData({ headers, rows });
      } catch (error) {
        console.error("Error reading Excel file:", error);
      } finally {
        setLoading(false);
      }
    };

    if (file) {
      readExcel();
    }
  }, [file]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
      </div>
    );
  }

  if (!previewData) {
    return (
      <div className="text-center p-4 text-muted-foreground">
        Unable to preview file
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-[#1A1F2C] text-white">
      <div className="p-4 flex justify-between items-center border-b border-gray-700">
        <h3 className="font-semibold text-white">Preview: {file.name}</h3>
        <span className="text-sm text-gray-400">First 20 rows</span>
      </div>
      <ScrollArea className="h-[400px] w-full">
        <div className="p-4">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-700">
                {previewData.headers.map((header, index) => (
                  <TableHead 
                    key={index} 
                    className="text-gray-300 whitespace-nowrap border-gray-700"
                  >
                    {header || `Column ${index + 1}`}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewData.rows.map((row, rowIndex) => (
                <TableRow 
                  key={rowIndex} 
                  className="border-gray-700 hover:bg-gray-800/50"
                >
                  {row.map((cell, cellIndex) => (
                    <TableCell 
                      key={cellIndex} 
                      className="text-gray-200 truncate max-w-[200px] border-gray-700"
                    >
                      {cell?.toString() || "-"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ScrollArea>
    </div>
  );
}