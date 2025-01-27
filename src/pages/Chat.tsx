import { useState } from "react";
import { BarChart2, Table2, FileSpreadsheet, Upload, MessageSquarePlus } from "lucide-react";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";

const Chat = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const placeholders = [
    "Add a file or start chat...",
    "Summarise the data in my sheet",
    "Sum column C when when rows in Column B equal June",
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Handle form submission
  };

  const workflows = [
    {
      icon: <BarChart2 className="w-8 h-8" />,
      title: "Quick Visualization",
      description: "Visually explore your spreadsheet data",
      runs: "42250 runs",
    },
    {
      icon: <Table2 className="w-8 h-8" />,
      title: "Data Cleaner",
      description: "Methodically clean your data",
      runs: "11000 runs",
    },
    {
      icon: <FileSpreadsheet className="w-8 h-8" />,
      title: "Extract Tables",
      description: "Extract tables from spreadsheets",
      runs: "4367 runs",
    },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-900 text-white">
        <AppSidebar />
        <div className="flex-1">
          <nav className="bg-gray-900/50 backdrop-blur-sm fixed top-0 w-full z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16 items-center">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-excel">
                    <MessageSquarePlus className="w-5 h-5" />
                    <h1 className="text-xl font-bold font-bricolage">New Chat</h1>
                  </div>
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
                    <Button 
                      variant="outline" 
                      className="bg-transparent border-gray-700 text-white hover:bg-gray-800 transition-all duration-300 hover:shadow-[0_0_15px_rgba(255,255,255,0.3)] hover:border-white"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload File
                    </Button>
                    <PlaceholdersAndVanishInput
                      placeholders={placeholders}
                      onChange={handleChange}
                      onSubmit={handleSubmit}
                    />
                  </div>
                </div>

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