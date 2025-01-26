import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FileUpload() {
  const [file, setFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    if (uploadedFile?.type.includes("spreadsheet") || uploadedFile?.name.endsWith(".xlsx") || uploadedFile?.name.endsWith(".xls")) {
      setFile(uploadedFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
  });

  return (
    <div className="w-full max-w-md mx-auto">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-excel bg-excel/5" : "border-gray-300 hover:border-excel"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-4">
          {file ? (
            <>
              <FileSpreadsheet className="w-12 h-12 text-excel" />
              <p className="text-sm text-gray-600">{file.name}</p>
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
              >
                Remove File
              </Button>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 text-gray-400" />
              <p className="text-lg font-medium">
                {isDragActive ? "Drop your Excel file here" : "Drag & drop your Excel file here"}
              </p>
              <p className="text-sm text-gray-500">or click to browse</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}