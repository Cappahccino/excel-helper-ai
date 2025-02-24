
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const typeformLink = "https://form.typeform.com/to/UQPZGSy6";

interface RequestBody {
  email: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: RequestBody = await req.json();
    if (!email) {
      throw new Error("Email is required.");
    }

    console.log(`Sending welcome email to: ${email}`);

    const emailContent = `
      <p>Hi,</p>
      <p>As one of our early community members, you'll be among the first to experience what it's like to have an AI-powered finance partner by your side.</p>
      <h3>What's Next?</h3>
      <ul>
        <li>✔ You're now in line to access Tallyze's cutting-edge financial automation capabilities.</li>
        <li>✔ We'll reach out personally when it's time to onboard you.</li>
        <li>✔ You'll receive exclusive updates on our progress and insights into how teams are transforming their finance workflows with AI.</li>
      </ul>
      <h3>We'd Love to Hear From You! 📝</h3>
      <p>We're shaping Tallyze based on real user needs, and your feedback is crucial.</p>
      <p><strong>Take our 2-minute survey</strong> and help us understand how we can automate your finance workflows more effectively.</p>

      <a href="${typeformLink}" style="
      display: inline-block;
      padding: 12px 20px;
      margin-top: 10px;
      background-color: #27B67A;
      color: white;
      text-decoration: none;
      font-size: 16px;
      border-radius: 5px;">
      👉 Take the Survey
      </a>
      <p>Looking forward to helping you unlock financial efficiency and intelligence like never before.</p>
      <p><strong>Best,</strong><br>The Tallyze Team</p>
    `;

    const emailResponse = await resend.emails.send({
      from: "Tallyze <noreply@waitlist.tallyze.com>",
      to: email,
      subject: "Welcome to Tallyze – Your AI-Powered Finance Partner 🚀",
      html: emailContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
