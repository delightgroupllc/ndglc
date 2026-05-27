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
