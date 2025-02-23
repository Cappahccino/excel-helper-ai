
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error: dbError } = await supabase
        .from('waitlist_users')
        .insert([{ email }]);

      if (dbError) throw dbError;

      const { error: emailError } = await supabase.functions
        .invoke('send-waitlist-email', {
          body: { email }
        });

      if (emailError) throw emailError;

      setSubmitted(true);
      setEmail('');
      toast({
        title: "Success!",
        description: "You've been added to our waitlist. Check your email for confirmation.",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex flex-col">
      {/* Decorative Elements */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] pointer-events-none"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/80 pointer-events-none"></div>
      
      {/* Header */}
      <header className="relative w-full py-8">
        <h2 className="text-4xl text-center text-gray-900" style={{ fontFamily: 'Jersey, serif' }}>
          Tallyze
        </h2>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-4xl w-full mx-auto text-center">
          <div className="space-y-6 mb-12">
            <h1 className="text-5xl md:text-7xl font-bold text-gray-900 tracking-tight">
              <span className="block mb-2 animate-fade-in opacity-0 [animation-delay:200ms]">Automate.</span>
              <span className="block mb-2 animate-fade-in opacity-0 [animation-delay:400ms]">Analyze.</span>
              <span className="block animate-fade-in opacity-0 [animation-delay:600ms]">Accelerate.</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto">
              Streamline your Financial Operations with Tallyze
            </p>
            
            <div className="w-24 h-1 bg-purple-600 mx-auto rounded-full"></div>
          </div>

          {submitted ? (
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-8 max-w-md mx-auto border border-purple-100 shadow-xl">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-xl">Thank you for joining!</p>
              <p className="text-gray-600 mt-2">We'll notify you when we launch.</p>
            </div>
          ) : (
            <div className="max-w-md mx-auto">
              <form onSubmit={handleSubmit} className="group">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="w-full px-6 py-4 rounded-xl border-2 border-purple-100 bg-white/80 backdrop-blur-sm placeholder:text-gray-400 text-gray-900 focus:outline-none focus:border-purple-300 shadow-lg transition-all duration-300"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="bg-purple-600 text-white px-8 py-4 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-purple-700 transition-all duration-300 shadow-lg disabled:opacity-50"
                  >
                    <span>{isLoading ? 'Joining...' : 'Join Waitlist'}</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-gray-500 text-sm mt-4">
                  We respect your privacy
                </p>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative w-full py-8">
        <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-purple-50/50 to-transparent pointer-events-none"></div>
      </footer>
    </div>
  );
};

export default Index;
