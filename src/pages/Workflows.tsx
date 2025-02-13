
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatSidebar } from '@/components/ChatSidebar';
import { SidebarProvider } from '@/components/ui/sidebar-new';
import { 
  FolderPlus, 
  FilePlus, 
  BookOpen, 
  Info,
  LayoutTemplate,
  Search,
  Clock,
  Star,
  Activity,
  Play,
  Edit,
  Copy,
  Trash2
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Workflow {
  id: string;
  name: string;
  description: string;
  lastRun: string;
  status: 'success' | 'failed' | 'running' | 'idle';
  type: string;
}

const mockWorkflows: Workflow[] = [
  {
    id: "1",
    name: "Monthly Sales Report",
    description: "Aggregates sales data and generates executive summary",
    lastRun: "2 hours ago",
    status: "success",
    type: "reporting"
  },
  {
    id: "2",
    name: "Customer Data Cleanup",
    description: "Standardizes customer information across sheets",
    lastRun: "1 day ago",
    status: "failed",
    type: "data-processing"
  },
  {
    id: "3",
    name: "Inventory Analysis",
    description: "Tracks stock levels and suggests reorder points",
    lastRun: "3 hours ago",
    status: "running",
    type: "analysis"
  }
];

export default function Workflows() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const getStatusColor = (status: Workflow['status']) => {
    switch (status) {
      case 'success':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'running':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  const filteredWorkflows = mockWorkflows.filter(workflow => {
    const matchesSearch = workflow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         workflow.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || workflow.type === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const templates = [
    {
      title: "Data Cleanup",
      description: "Automatically clean and format Excel data",
      icon: <LayoutTemplate className="h-6 w-6" />,
      category: "Data Processing",
      difficulty: "Easy",
      timeSaved: "2 hours/week"
    },
    {
      title: "Report Generator",
      description: "Generate reports from Excel data",
      icon: <LayoutTemplate className="h-6 w-6" />,
      category: "Reporting",
      difficulty: "Medium",
      timeSaved: "4 hours/week"
    },
    {
      title: "Data Merger",
      description: "Merge multiple Excel files into one",
      icon: <LayoutTemplate className="h-6 w-6" />,
      category: "Data Processing",
      difficulty: "Medium",
      timeSaved: "3 hours/week"
    },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50">
        <div className="fixed left-0 top-0 h-full z-10">
          <ChatSidebar />
        </div>
        <div className="flex-1 flex flex-col transition-all duration-200 ml-[60px] sidebar-expanded:ml-[300px]">
          <div className="flex-grow flex flex-col h-[calc(100vh-80px)]">
            <div className="w-full mx-auto max-w-7xl flex-grow flex flex-col px-4 lg:px-6 pt-4">
              <div className="mb-6">
                <div className="flex justify-between items-center mb-6">
                  <h1 className="text-2xl font-bold">Workflows</h1>
                </div>
                
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">12</div>
                        <p className="text-xs text-muted-foreground">+2 from last month</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Time Saved</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">24.5h</div>
                        <p className="text-xs text-muted-foreground">This month</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                        <Star className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">98.5%</div>
                        <p className="text-xs text-muted-foreground">Last 30 days</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>

              <div className="flex-grow flex flex-col overflow-hidden bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-4 border-b border-gray-100">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">My Workflows</h2>
                    <div className="flex gap-4">
                      <Button
                        variant="outline"
                        className="hover:border-excel hover:text-excel"
                        onClick={() => {/* TODO: Implement folder creation */}}
                      >
                        <FolderPlus className="h-4 w-4 mr-2" />
                        New Folder
                      </Button>
                      <Button
                        className="bg-excel hover:bg-excel/90"
                        onClick={() => {/* TODO: Implement workflow creation */}}
                      >
                        <FilePlus className="h-4 w-4 mr-2" />
                        New Workflow
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                      <Input
                        placeholder="Search workflows..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        <SelectItem value="reporting">Reporting</SelectItem>
                        <SelectItem value="data-processing">Data Processing</SelectItem>
                        <SelectItem value="analysis">Analysis</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <ScrollArea className="flex-grow p-4">
                  <div className="grid grid-cols-1 gap-4">
                    {filteredWorkflows.map((workflow) => (
                      <Card key={workflow.id} className="hover:border-excel transition-all">
                        <CardHeader className="flex flex-row items-start justify-between space-y-0">
                          <div>
                            <CardTitle className="text-xl">{workflow.name}</CardTitle>
                            <CardDescription>{workflow.description}</CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
                              <Play className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-900">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex justify-between items-center text-sm">
                            <span className={`flex items-center gap-2 ${getStatusColor(workflow.status)}`}>
                              <span className="relative flex h-2 w-2">
                                <span className={`animate.ping absolute inline-flex h-full w-full rounded-full opacity-75 ${getStatusColor(workflow.status)}`}></span>
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${getStatusColor(workflow.status)} bg-current`}></span>
                              </span>
                              {workflow.status.charAt(0).toUpperCase() + workflow.status.slice(1)}
                            </span>
                            <span className="text-gray-500">Last run: {workflow.lastRun}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6 mb-6">
                <h2 className="text-2xl font-bold mb-6">Templates</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {templates.map((template, index) => (
                    <Card key={index} className="hover:border-excel cursor-pointer transition-all">
                      <CardHeader>
                        <div className="flex items-center gap-3 mb-3">
                          {template.icon}
                          <div>
                            <CardTitle>{template.title}</CardTitle>
                            <CardDescription>{template.category}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-600 text-sm mb-4">{template.description}</p>
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>Difficulty: {template.difficulty}</span>
                          <span>Saves: {template.timeSaved}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
                <h2 className="text-2xl font-bold mb-6">Resources</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <a
                    href="/docs/quickstart"
                    className="flex items-start gap-4 p-6 border rounded-lg hover:border-excel group"
                  >
                    <BookOpen className="h-6 w-6 flex-shrink-0 group-hover:text-excel" />
                    <div>
                      <h3 className="font-semibold mb-2">Quick Start Guide</h3>
                      <p className="text-sm text-gray-600">
                        Learn the basics of creating and managing workflows
                      </p>
                    </div>
                  </a>
                  <a
                    href="/docs/tips"
                    className="flex items-start gap-4 p-6 border rounded-lg hover:border-excel group"
                  >
                    <Info className="h-6 w-6 flex-shrink-0 group-hover:text-excel" />
                    <div>
                      <h3 className="font-semibold mb-2">Tips & Tricks</h3>
                      <p className="text-sm text-gray-600">
                        Get the most out of your automation workflows
                      </p>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
