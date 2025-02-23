
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Resend } from "npm:resend@2.0.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const typeformLink = "https://form.typeform.com/to/UQPZGSy6"; 

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { email } = await req.json()
    const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

    const emailContent = `
      <p>Hi,</p>
      <p>As one of our early community members, you'll be among the first to experience what it's like to have an AI-powered finance partner by your side.</p>
      <h3>What's Next?</h3>
      <ul>
        <li>✔ You're now in line to access Tallyze's cutting-edge financial automation capabilities.</li>
        <li>✔ We'll reach out personally when it's time to onboard you.</li>
        <li>✔ You'll receive exclusive updates on our progress and insights into how teams are transforming their finance workflows with AI.</li>
      </ul>
      <h3>What Can You Expect with Tallyze?</h3>
      <ul>
        <li>💡 Instant financial insights – AI-driven reports, reconciliations, and real-time analytics.</li>
        <li>🔄 Automated workflows – Eliminate tedious data entry and manual processing.</li>
        <li>📊 Seamless integrations – Connect with Xero, QuickBooks, and your existing finance tools.</li>
        <li>🤝 A dedicated AI partner – Helping you scale with precision and accuracy.</li>
      </ul>
      <p>In the meantime, we'd love to hear from you! </p>
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
      border-radius: 5px;
      ">
      👉 Take the Survey
      </a>
      <p>Looking forward to helping you unlock financial efficiency and intelligence like never before.</p>
      <p><strong>Best,</strong><br>The Tallyze Team</p>
    `

    console.log('Sending welcome email to:', email)
    const { data, error } = await resend.emails.send({
      from: 'Tallyze <noreply@waitlist.tallyze.com>',
      to: email,
      subject: 'Welcome to Tallyze – Your AI-Powered Finance Partner 🚀',
      html: emailContent,
    })

    if (error) {
      console.error('Error sending email:', error)
      throw error
    }

    console.log('Email sent successfully:', data)
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
