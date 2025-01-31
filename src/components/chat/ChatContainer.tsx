import React from "react";
import { FileUploadZone } from "@/components/FileUploadZone";
import { ExcelPreview } from "@/components/ExcelPreview";

interface ChatContainerProps {
  children: React.ReactNode;
  currentFile: File | null;
  isUploading: boolean;
  uploadProgress: number;
  handleFileUpload: (file: File) => Promise<void>;
  handleReset: () => void;
}

export function ChatContainer({
  children,
  currentFile,
  isUploading,
  uploadProgress,
  handleFileUpload,
  handleReset,
}: ChatContainerProps) {
  return (
    <div className="flex min-h-screen w-full bg-gray-900 text-white">
      <div className="flex-1">
        <main className="pt-20 pb-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-blue-900/20 backdrop-blur-sm rounded-3xl p-8 shadow-xl">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold mb-4">
                  What do you need help analyzing?
                </h2>
                <div className="max-w-2xl mx-auto">
                  <FileUploadZone
                    onFileUpload={handleFileUpload}
                    isUploading={isUploading}
                    uploadProgress={uploadProgress}
                    currentFile={currentFile}
                    onReset={handleReset}
                  />
                  
                  {currentFile && (
                    <div className="mt-8">
                      <ExcelPreview file={currentFile} />
                    </div>
                  )}

                  {children}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}