import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";

interface FileUploadSectionProps {
  placeholders: string[];
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  handleFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  allowedExtensions?: string[];
}

export function FileUploadSection({
  placeholders,
  handleFileUpload,
  handleChange,
  handleSubmit,
  allowedExtensions,
}: FileUploadSectionProps) {
  return (
    <div className="text-center mb-12">
      <h2 className="text-3xl font-bold mb-4">
        What do you need help analyzing?
      </h2>
      <div className="max-w-2xl mx-auto flex items-center gap-4">
        {handleFileUpload && allowedExtensions && (
          <>
            <input
              type="file"
              accept={allowedExtensions.join(',')}
              onChange={handleFileUpload}
              className="hidden"
              id="excel-upload"
            />
            <label htmlFor="excel-upload">
              <Button 
                variant="outline" 
                className="bg-transparent border-gray-700 text-white hover:bg-gray-800 transition-all duration-300 hover:shadow-[0_0_15px_rgba(255,255,255,0.3)] hover:border-white"
                onClick={() => document.getElementById('excel-upload')?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload File
              </Button>
            </label>
          </>
        )}
        <PlaceholdersAndVanishInput
          placeholders={placeholders}
          onChange={handleChange}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}