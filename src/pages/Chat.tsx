import { useState } from "react";
import { BarChart2, Table2, FileSpreadsheet, Upload } from "lucide-react";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ExcelPreview } from "@/components/ExcelPreview";
import { supabase } from "@/integrations/supabase/client";

const ALLOWED_EXCEL_EXTENSIONS = [
  '.xlsx', '.xlsm', '.xlsb', '.xltx', '.xltm', '.xls', '.xlt',
  '.xml', '.xlam', '.xla', '.xlw', '.xlr', '.csv'
];

// Define the workflows data
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
    "Sum column C when when rows in Column B equal June",
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uploadedFile && !searchQuery.trim()) return;

    try {
      setIsAnalyzing(true);
      
      // Get the Excel content
      const fileContent = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result);
        reader.readAsText(uploadedFile as File);
      });

      // Call the edge function to analyze the file
      const { data, error } = await supabase.functions.invoke('analyze-excel', {
        body: { fileContent, userPrompt: searchQuery },
      });

      if (error) throw error;

      toast({
        title: "Analysis Complete",
        description: data.analysis,
      });

      setSearchQuery("");
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to analyze the file. Please try again.",
        variant: "destructive",
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
        variant: "destructive",
      });
      return;
    }

    setUploadedFile(file);
    toast({
      title: "File uploaded",
      description: `Successfully uploaded ${file.name}`,
    });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-900 text-white">
        <AppSidebar />
        <div className="flex-1">
          <nav className="bg-gray-900/50 backdrop-blur-sm fixed top-0 w-full z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16 items-center">
                <div className="flex-1 text-center">
                  <h1 className="text-xl font-bold text-excel font-bricolage">New Chat</h1>
                </div>
              </div>
            </div>
          </nav>

          <main className="pt-20 pb-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="bg-blue-900/20 backdrop-blur-sm rounded-3xl p-8 shadow-xl">
                <div className="text-center mb-12">
                  <h2 className="text-3xl font-bold mb-4">
                    What do you need help analyzing?
                  </h2>
                  <div className="max-w-2xl mx-auto flex items-center gap-4">
                    <input
                      type="file"
                      accept={ALLOWED_EXCEL_EXTENSIONS.join(',')}
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
                    <PlaceholdersAndVanishInput
                      placeholders={placeholders}
                      onChange={handleChange}
                      onSubmit={handleSubmit}
                    />
                  </div>
                </div>

                {uploadedFile && (
                  <div className="mb-8">
                    <ExcelPreview file={uploadedFile} />
                  </div>
                )}

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
                      <div
                        key={index}
                        className="p-6 rounded-xl border border-gray-700/50 bg-gray-800/50 hover:bg-gray-800/70 transition-colors cursor-pointer backdrop-blur-sm"
                      >
                        <div className="mb-4 text-blue-400">{workflow.icon}</div>
                        <h4 className="text-lg font-semibold mb-2">
                          {workflow.title}
                        </h4>
                        <p className="text-gray-400 text-sm mb-4">
                          {workflow.description}
                        </p>
                        <p className="text-xs text-gray-500">{workflow.runs}</p>
                      </div>
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