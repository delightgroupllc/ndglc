import type { APIRoute } from 'astro';
import { query } from '../../../lib/db';
import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().min(1, "Phone is required"),
  division: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(1, "Message is required"),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    
    // Combine division/subject into the message for now or just map division to inquiry_type
    const parsed = contactSchema.parse(data);

    // Schema: name, email, phone, message, inquiry_type ('sales', 'support', 'partnership', 'general')
    // We map 'division' or context to inquiry_type for simplicity, defaulting to 'sales'
    let inquiryType = 'general';
    if (parsed.division === 'Technical Lighting' || parsed.division === 'Greenscapes') {
      inquiryType = 'sales';
    }

    // Append subject and division to message
    const fullMessage = `Subject: ${parsed.subject || 'N/A'}\nDivision: ${parsed.division || 'N/A'}\n\n${parsed.message}`;

    await query(
      `INSERT INTO contacts (name, email, phone, message, inquiry_type) VALUES ($1, $2, $3, $4, $5)`,
      [parsed.name, parsed.email, parsed.phone, fullMessage, inquiryType]
    );

    // Resend email notification
    const RESEND_API_KEY = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
    const RESEND_FROM_EMAIL = import.meta.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    let targetEmail = 'info@delightgroupllc.ae';
    try {
      const emailSetting = await query(`SELECT value FROM settings WHERE key = 'contact_email'`);
      if (emailSetting && emailSetting.rows && emailSetting.rows[0]) {
        targetEmail = emailSetting.rows[0].value;
      }
    } catch (dbErr) {
      console.warn('Failed to fetch contact_email setting, using default:', dbErr);
    }

    if (RESEND_API_KEY) {
      try {
        const emailHtml = `
          <h2>New Contact Inquiry Submitted</h2>
          <p><strong>Name:</strong> ${parsed.name}</p>
          <p><strong>Email:</strong> ${parsed.email}</p>
          <p><strong>Phone:</strong> ${parsed.phone}</p>
          <p><strong>Division:</strong> ${parsed.division || 'N/A'}</p>
          <p><strong>Subject:</strong> ${parsed.subject || 'N/A'}</p>
          <hr />
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap;">${parsed.message}</p>
        `;

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: RESEND_FROM_EMAIL,
            to: targetEmail,
            subject: `New Contact Inquiry: ${parsed.subject || 'General Inquiry'}`,
            html: emailHtml,
            reply_to: parsed.email
          })
        });

        if (!resendRes.ok) {
          const errData = await resendRes.json().catch(() => ({}));
          console.error('Resend API error response:', errData);
        } else {
          console.log('Successfully sent contact inquiry email via Resend to:', targetEmail);
        }
      } catch (emailErr) {
        console.error('Failed to send email via Resend:', emailErr);
      }
    } else {
      console.warn('RESEND_API_KEY is not configured. Email notification skipped.');
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Contact form error:', error);
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: error.errors }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
