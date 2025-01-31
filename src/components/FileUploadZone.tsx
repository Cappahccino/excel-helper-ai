import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { FILE_CONFIG } from "@/config/fileConfig";

interface FileUploadZoneProps {
  onFileUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  uploadProgress: number;
  currentFile: File | null;
  onReset: () => void;
}

export function FileUploadZone({
  onFileUpload,
  isUploading,
  uploadProgress,
  currentFile,
  onReset,
}: FileUploadZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles[0]) {
        onFileUpload(acceptedFiles[0]);
      }
    },
    [onFileUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FILE_CONFIG.ALLOWED_EXCEL_EXTENSIONS,
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false,
    maxSize: FILE_CONFIG.MAX_FILE_SIZE,
  });

  return (
    <div className="w-full max-w-md mx-auto">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-excel bg-excel/5" : "border-gray-300 hover:border-excel"
        }`}
        role="button"
        tabIndex={0}
        aria-label="Upload Excel file"
      >
        <input {...getInputProps()} aria-label="File input" />
        <div className="flex flex-col items-center gap-4">
          {currentFile ? (
            <>
              <div className="w-full space-y-4">
                <p className="text-sm text-gray-600">{currentFile.name}</p>
                {isUploading && (
                  <Progress 
                    value={uploadProgress} 
                    className="w-full"
                    aria-label="Upload progress"
                  />
                )}
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReset();
                  }}
                  aria-label="Remove file"
                >
                  Remove File
                </Button>
              </div>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 text-gray-400" aria-hidden="true" />
              <p className="text-lg font-medium">
                {isDragActive ? "Drop your Excel file here" : "Drag & drop your Excel file here"}
              </p>
              <p className="text-sm text-gray-500">or click to browse</p>
              <p className="text-xs text-gray-400">Maximum file size: 10MB</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}