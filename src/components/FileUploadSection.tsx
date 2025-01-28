import { ChangeEvent, FormEvent } from "react";

interface FileUploadSectionProps {
  placeholders: string[];
  handleFileUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  handleChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: FormEvent) => void;
  allowedExtensions: string[];
}

export function FileUploadSection({
  placeholders,
  handleFileUpload,
  handleChange,
  handleSubmit,
  allowedExtensions,
}: FileUploadSectionProps) {
  return (
    <div className="mb-8">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">Upload Excel File</h2>
        <p className="text-muted-foreground">
          Upload your Excel file and ask questions about your data
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="file"
            accept={allowedExtensions.join(",")}
            onChange={handleFileUpload}
            className="block w-full text-sm text-muted-foreground
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-violet-50 file:text-violet-700
              hover:file:bg-violet-100"
          />
        </div>

        <div className="relative">
          <input
            type="text"
            onChange={handleChange}
            placeholder={placeholders[0]}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
        >
          Analyze File
        </button>
      </form>
    </div>
  );
}