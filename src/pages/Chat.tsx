import { useState } from "react";
import { BarChart2, Table2, FileSpreadsheet } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { WorkflowCard } from "@/components/WorkflowCard";
import { ChatHeader } from "@/components/ChatHeader";
import { FileUploadSection } from "@/components/FileUploadSection";

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
  const { toast } = useToast();

  const placeholders = [
    "Ask me anything...",
    "How can I help you today?",
    "What would you like to know?",
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      toast({
        title: "Message sent",
        description: "Your message has been received.",
      });
      setSearchQuery("");
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to process your request. Please try again.",
        variant: "destructive",
      });
    }
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
                  handleChange={handleChange}
                  handleSubmit={handleSubmit}
                />

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