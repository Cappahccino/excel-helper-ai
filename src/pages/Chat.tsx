import { useState } from "react";
import { BarChart2, Table2, FileSpreadsheet } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { WorkflowCard } from "@/components/WorkflowCard";
import { ChatHeader } from "@/components/ChatHeader";
import { FileUploadSection } from "@/components/FileUploadSection";

const ALLOWED_EXCEL_EXTENSIONS = [
  '.xlsx', '.xlsm', '.xlsb', '.xltx', '.xltm', '.xls', '.xlt',
  '.xml', '.xlam', '.xla', '.xlw', '.xlr', '.csv'
];

const workflows = [
  {
    icon: <BarChart2 className="w-6 h-6" />,
    title: "Data Analysis",
    description: "Analyze your Excel data with advanced statistical methods",
    runs: "2.5k runs"
  },
  {
    icon: <Table2 className="w-6 h-6" />,
    title: "Table Operations",
    description: "Perform complex table operations and transformations",
    runs: "1.8k runs"
  },
  {
    icon: <FileSpreadsheet className="w-6 h-6" />,
    title: "Excel Processing",
    description: "Process and clean your Excel files automatically",
    runs: "3.2k runs"
  }
];

const Chat = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const placeholders = [
    "Add a file or start chat...",
    "Summarise the data in my sheet",
    "Sum column C when when rows in Column B equal June"
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFile && !searchQuery.trim()) return;

    try {
      setIsAnalyzing(true);

      // Create form data for file upload
      const formData = new FormData();
      formData.append('file', uploadedFile!);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Upload file to Supabase Storage and save metadata
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke(
        'upload-excel',
        {
          body: formData,
        }
      );

      if (uploadError) throw uploadError;

      // Analyze file
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
        'analyze-excel',
        {
          body: {
            fileId: uploadData.fileId,
            userPrompt: searchQuery.trim() || null,
          },
        }
      );

      if (analysisError) throw analysisError;

      toast({
        title: "Analysis Complete",
        description: analysisData.analysis,
      });
      setSearchQuery("");
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to analyze the file. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!ALLOWED_EXCEL_EXTENSIONS.includes(fileExtension)) {
      toast({
        title: "Invalid file type",
        description: "Please upload only Excel compatible files",
        variant: "destructive"
      });
      return;
    }

    setUploadedFile(file);
    toast({
      title: "File uploaded",
      description: `Successfully uploaded ${file.name}`
    });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-900 text-white">
        <AppSidebar />
        <div className="flex-1">
          <ChatHeader />

          <main className="pt-20 pb-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="bg-blue-900/20 backdrop-blur-sm rounded-3xl p-8 shadow-xl">
                <FileUploadSection
                  placeholders={placeholders}
                  handleFileUpload={handleFileUpload}
                  handleChange={handleChange}
                  handleSubmit={handleSubmit}
                  allowedExtensions={ALLOWED_EXCEL_EXTENSIONS}
                />

                {isAnalyzing && (
                  <div className="flex items-center justify-center p-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
                    <span className="ml-2 text-sm text-gray-400">Analyzing...</span>
                  </div>
                )}

                <div className="mb-12">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold">
                      Or start from ready workflows
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {workflows.map((workflow, index) => (
                      <WorkflowCard key={index} {...workflow} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Chat;