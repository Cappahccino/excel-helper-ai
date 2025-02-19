
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileSpreadsheet, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { FILE_CONFIG } from "@/config/fileConfig";
import { TagSelect } from "./tags/TagSelect";
import { useQuery } from "@tanstack/react-query";
import { fetchTags } from "@/services/tagService";

interface FileUploadZoneProps {
  onFileUpload: (files: File[]) => Promise<void>;
  isUploading: boolean;
  uploadProgress: Record<string, number>;
  currentFiles: File[] | null;
  onReset: () => void;
  onUploadComplete: () => void;
}

export function FileUploadZone({
  onFileUpload,
  isUploading,
  uploadProgress,
  currentFiles,
  onReset,
  onUploadComplete,
}: FileUploadZoneProps) {
  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: fetchTags
  });

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        try {
          await onFileUpload(acceptedFiles);
          onUploadComplete();
        } catch (error) {
          console.error('Upload error:', error);
        }
      }
    },
    [onFileUpload, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FILE_CONFIG.ALLOWED_EXCEL_EXTENSIONS,
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: true,
    maxSize: FILE_CONFIG.MAX_FILE_SIZE,
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!currentFiles || currentFiles.length === 0) {
    return (
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-6 bg-white transition-all duration-200 ${
          isDragActive 
            ? "border-excel bg-excel/5" 
            : "border-gray-200 hover:border-excel/50 hover:bg-gray-50"
        }`}
        role="button"
        tabIndex={0}
        aria-label="Upload Excel files"
      >
        <input {...getInputProps()} aria-label="File input" />
        <div className="flex flex-col items-center gap-4">
          <Upload className="w-12 h-12 text-gray-400" aria-hidden="true" />
          <div className="text-center">
            <p className="text-lg font-medium text-gray-700">
              {isDragActive ? "Drop your Excel files here" : "Drag & Drop Excel Files"}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              or click to browse
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Maximum file size per file: 10MB
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {currentFiles.map((file, index) => (
        <div 
          key={index} 
          className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
        >
          <div className="border-b border-gray-100 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FileSpreadsheet className="w-8 h-8 text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {isUploading && uploadProgress[index] !== undefined && (
                  <div className="w-24">
                    <Progress 
                      value={uploadProgress[index]} 
                      className="h-1.5 bg-green-100"
                      indicatorClassName="bg-green-500"
                      aria-label="Upload progress"
                    />
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReset();
                  }}
                  className="text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                  aria-label="Remove files"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          
          <div className="p-3 bg-gray-50">
            <TagSelect
              tags={tags}
              selectedTags={[]}
              onSelect={() => {}}
              onRemove={() => {}}
              className="w-full"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
