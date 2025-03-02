
import { useMemo } from "react";
import { Table } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface ChatFilePreviewProps {
  fileId: string;
  isLoading: boolean;
  data: any[];
  headers: string[];
}

export function ChatFilePreview({ fileId, isLoading, data, headers }: ChatFilePreviewProps) {
  const previewRows = useMemo(() => data.slice(0, 5), [data]);
  
  if (isLoading) {
    return (
      <div className="rounded-lg border p-4 space-y-2">
        <Skeleton className="h-6 w-48" />
        <div className="space-y-2">
          {Array(5).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="p-2 bg-gray-50 border-b font-medium">
        File Preview
      </div>
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              {headers.map((header, i) => (
                <th key={i} className="px-4 py-2 text-left text-sm font-medium text-gray-500">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i} className="border-b last:border-0">
                {headers.map((header, j) => (
                  <td key={j} className="px-4 py-2 text-sm">
                    {row[header] || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
