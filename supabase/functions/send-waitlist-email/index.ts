import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const typeformLink = "https://form.typeform.com/to/UQPZGSy6";
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface RequestBody {
  email: string;
}

interface SupabaseResponse {
  data: any[];
  error?: { message: string };
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

    // Check if email already exists in Supabase
    const fetchUrl = `${supabaseUrl}/rest/v1/waitlist_users?email=eq.${email}&select=email`;
    const fetchResponse = await fetch(fetchUrl, {
      method: "GET",
      headers: {
        "apikey": supabaseKey!,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
    });

    const fetchData: SupabaseResponse = await fetchResponse.json();
    
    if (fetchData.data.length > 0) {
      console.log("Duplicate email detected:", email);
      return new Response(
        JSON.stringify({ success: false, message: "You are already on the waitlist!" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Insert new waitlist entry into Supabase
    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/waitlist_users`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey!,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    const insertData = await insertResponse.json();
    if (!insertResponse.ok) {
      throw new Error(insertData.error?.message || "Failed to save email.");
    }

    console.log("New waitlist signup:", email);

    // Send the email via Resend
    const emailContent = `
      <p>Hi,</p>
      <p>As one of our early community members, you'll be among the first to experience what it's like to have an AI-powered finance partner by your side.</p>
      <h3>What's Next?</h3>
      <ul>
        <li>✔ You're now in line to access Tallyze's cutting-edge financial automation capabilities.</li>
        <li>✔ We'll reach out personally when it's time to onboard you.</li>
        <li>✔ You'll receive exclusive updates on our progress and insights into how teams are transforming their finance workflows with AI.</li>
      </ul>
      <h3>We’d Love to Hear From You! 📝</h3>
      <p>We’re shaping Tallyze based on real user needs, and your feedback is crucial.</p>
      <p><strong>Take our 2-minute survey</strong> and help us understand how we can automate your finance workflows more effectively.</p>

      <a href="${typeformLink}" style="
      display: inline-block;
      padding: 12px 20px;
      margin-top: 10px;
      background-color: #007bff;
      color: white;
      text-decoration: none;
      font-size: 16px;
      border-radius: 5px;">
      👉 Take the Survey
      </a>
      <p>Looking forward to helping you unlock financial efficiency and intelligence like never before.</p>
      <p><strong>Best,</strong><br>The Tallyze Team</p>
    `;

    console.log("Sending welcome email to:", email);

    const response = await fetch("https://api.resend.com/v1/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Tallyze <noreply@waitlist.tallyze.com>",
        to: email,
        subject: "Welcome to Tallyze – Your AI-Powered Finance Partner 🚀",
        html: emailContent,
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("Error sending email:", responseData);
      throw new Error(responseData.message || "Failed to send email");
    }

    console.log("Email sent successfully:", responseData);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
