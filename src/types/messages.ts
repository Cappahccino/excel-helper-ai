export interface FileData {
  file_path: string;
  id: string;
}

export interface LambdaRequestBody {
  fileId: string;
  filePath: string;
  query: string;
  supabaseUrl: string;
  supabaseKey: string;
}

export interface LambdaResponse {
  message: string;
  openAiResponse?: {
    model: string;
    usage: Record<string, any>;
  };
}