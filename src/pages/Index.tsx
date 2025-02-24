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
        .from("waitlist_users")
        .insert([{ email }]);

      if (dbError) throw dbError;

      const { error: emailError } = await supabase.functions.invoke("send-waitlist-email", {
        body: { email },
      });

      if (emailError) throw emailError;

      setSubmitted(true);
      setEmail("");
      toast({
        title: "Success!",
        description: "You've been added to our waitlist. Check your email for confirmation.",
      });
    } catch (error) {
      console.error("Error:", error);
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
    <div className="min-h-screen bg-gradient-to-br from-[#F2FCE2] via-white to-[#E8F9E3] flex flex-col">
      {/* Decorative Elements */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] pointer-events-none"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/80 pointer-events-none"></div>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-4xl w-full mx-auto text-center">
          
          {/* Logo Positioned at the Top of Main Content */}
          <div className="flex justify-center items-center mb-8">
            <span className="text-[#3cbd84] text-3xl md:text-4xl font-bold italic font-['Jersey_25']">
                Tallyze
             </span>
          </div>

          <div className="space-y-6 mb-12">
            <h1 className="text-5xl md:text-7xl font-bold text-gray-900 tracking-tight font-['Darker_Grotesque']">
              <span className="block mb-2 animate-fade-in opacity-0 [animation-delay:200ms]">Automate.</span>
              <span className="block mb-2 animate-fade-in opacity-0 [animation-delay:400ms]">Analyze.</span>
              <span className="block animate-fade-in opacity-0 [animation-delay:600ms]">Accelerate.</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto font-['Darker_Grotesque']">
              Streamline your Financial Operations with Tallyze
            </p>

            <div className="w-24 h-1 bg-[#27B67A] mx-auto rounded-full"></div>
          </div>

          {submitted ? (
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-8 max-w-md mx-auto border border-[#27B67A]/20 shadow-xl">
              <div className="w-12 h-12 bg-[#F2FCE2] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-[#27B67A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-xl font-['Darker_Grotesque']">Thank you for joining!</p>
              <p className="text-gray-600 mt-2 font-['Darker_Grotesque']">We'll notify you when we launch.</p>
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
                      className="w-full px-6 py-4 rounded-xl border-2 border-[#27B67A]/20 bg-white/80 backdrop-blur-sm placeholder:text-gray-400 text-gray-900 focus:outline-none focus:border-[#27B67A]/40 shadow-lg transition-all duration-300 font-['Darker_Grotesque']"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="bg-[#27B67A] text-white px-8 py-4 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#229163] transition-all duration-300 shadow-lg disabled:opacity-50 font-['Darker_Grotesque']"
                  >
                    <span>{isLoading ? "Joining..." : "Join Waitlist"}</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-gray-500 text-sm mt-4 font-['Darker_Grotesque']">
                  We respect your privacy
                </p>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative w-full py-8">
        <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-[#F2FCE2]/50 to-transparent pointer-events-none"></div>
      </footer>
    </div>
  );
};

export default Index;
