
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
      // Insert into waitlist
      const { error: dbError } = await supabase
        .from('waitlist_users')
        .insert([{ email }]);

      if (dbError) throw dbError;

      // Send welcome email
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
    <div className="min-h-screen bg-background flex flex-col overflow-hidden">
      <div className="absolute inset-0 gradient-bg opacity-10"></div>
      <div className="absolute inset-0">
        <div className="h-full w-full stats-grid opacity-5"></div>
      </div>
      
      <div className="relative w-full max-w-4xl mx-auto px-4 pt-12 sm:px-6 lg:px-8">
        <h2 className="text-center text-4xl text-gray mb-16" style={{ fontFamily: 'Jersey' }}>
          Tallyze
        </h2>
      </div>

      <div className="flex-1 flex items-center">
        <div className="relative w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative z-10">
            <div className="text-center">
              <h1 className="font-heading text-6xl md:text-8xl font-bold text-gray mb-6 tracking-tight leading-none">
                <span className="block animate-[float_6s_ease-in-out_infinite]">Automate.</span>
                <span className="block animate-[float_6s_ease-in-out_infinite] delay-[2s]">Analyze.</span>
                <span className="block animate-[float_6s_ease-in-out_infinite] delay-[4s]">Accelerate.</span>
              </h1>
              <p className="text-xl md:text-2xl text-gray/80 mb-8 max-w-2xl mx-auto font-light">
                Streamline your Financial Operations with Tallyze
              </p>
              
              <div className="w-24 h-1 bg-primary mx-auto mb-16 rounded-full"></div>

              {submitted ? (
                <div className="bg-white/40 backdrop-blur-md rounded-2xl p-8 max-w-md mx-auto border border-white/20 shadow-xl transform transition-all duration-500 ease-out">
                  <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-gray font-semibold text-xl">Thank you for joining the waitlist!</p>
                  <p className="text-gray/80 mt-2">We'll notify you when we launch.</p>
                </div>
              ) : (
                <div className="max-w-md mx-auto">
                  <form onSubmit={handleSubmit} className="group">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 relative">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Enter your email"
                          required
                          className="w-full px-6 py-4 rounded-xl border-2 border-transparent bg-white/40 backdrop-blur-md placeholder:text-gray/50 text-gray focus:outline-none focus:border-primary/50 shadow-lg transition-all duration-300"
                        />
                        <div className="absolute inset-0 rounded-xl bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="bg-gray text-white px-8 py-4 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray/90 transition-all duration-300 sm:w-auto w-full shadow-lg group relative overflow-hidden disabled:opacity-50"
                      >
                        <span className="relative z-10">{isLoading ? 'Joining...' : 'Join Waitlist'}</span>
                        <ArrowRight size={20} className="relative z-10 group-hover:translate-x-1 transition-transform" />
                        <div className="absolute inset-0 bg-primary opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                      </button>
                    </div>
                  </form>
                  <p className="text-gray/60 text-sm mt-4 group-hover:text-gray/80 transition-colors duration-300">
                    We respect your privacy
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="relative w-full py-8">
        <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-primary/5 to-transparent"></div>
      </div>
    </div>
  );
};

export default Index;
