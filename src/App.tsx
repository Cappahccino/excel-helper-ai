
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Suspense, lazy } from "react";
import "./App.css";
import { ScrollToTop } from "./components/ScrollToTop";
import { Toaster as ShadcnToaster } from "./components/ui/toaster";
import Home from "./pages/Home";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const Auth = lazy(() => import("./pages/Auth"));
const Files = lazy(() => import("./pages/Files"));
const Chat = lazy(() => import("./pages/Chat"));
const Canvas = lazy(() => import("./pages/Canvas"));
const Account = lazy(() => import("./pages/Account"));
const Workflows = lazy(() => import("./pages/Workflows"));
const Pricing = lazy(() => import("./pages/Pricing"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

const proxyFetchOpenAIImage = async (fileId: string) => {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    
    if (!token) {
      throw new Error('Unauthorized');
    }
    
    const supabaseUrl = (supabase as any).supabaseUrl;
    if (!supabaseUrl) {
      throw new Error('Supabase URL not available');
    }
    
    const functionUrl = `${supabaseUrl}/functions/v1/fetch-openai-image/${fileId}`;
    
    const response = await fetch(functionUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    return response;
  } catch (error) {
    console.error('Error fetching OpenAI image:', error);
    toast({
      title: "Image Error",
      description: `Failed to load image: ${error.message}`,
      variant: "destructive"
    });
    throw error;
  }
};

const OpenAIImageHandler = async (request: Request) => {
  try {
    const url = new URL(request.url);
    const fileId = url.pathname.replace('/api/fetch-openai-image/', '');
    
    if (!fileId) {
      return new Response('File ID is required', { status: 400 });
    }
    
    const response = await proxyFetchOpenAIImage(fileId);
    
    // Copy all headers from the Supabase response
    const headers = new Headers();
    response.headers.forEach((value, key) => {
      headers.set(key, value);
    });
    
    // Ensure cache headers are set for better performance
    if (!headers.has('Cache-Control')) {
      headers.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    }
    
    return new Response(response.body, { 
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (error) {
    console.error('Error handling OpenAI image:', error);
    return new Response(`Error: ${error.message}`, { 
      status: 500,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/auth",
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <Auth />
      </Suspense>
    ),
  },
  {
    path: "/files",
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <Files />
      </Suspense>
    ),
  },
  {
    path: "/chat",
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <Chat />
      </Suspense>
    ),
  },
  {
    path: "/canvas",
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <Canvas />
      </Suspense>
    ),
  },
  {
    path: "/account",
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <Account />
      </Suspense>
    ),
  },
  {
    path: "/workflows",
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <Workflows />
      </Suspense>
    ),
  },
  {
    path: "/pricing",
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <Pricing />
      </Suspense>
    ),
  },
  {
    path: "/api/fetch-openai-image/:fileId",
    loader: ({ params }) => {
      return null;
    },
    action: async ({ request }) => {
      return OpenAIImageHandler(request);
    },
  }
]);

function App() {
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ScrollToTop />
      </QueryClientProvider>
      <Toaster closeButton position="top-right" />
      <ShadcnToaster />
    </>
  );
}

export default App;
