import type { APIRoute } from 'astro';

const SYSTEM_PROMPT = `You are an industrial catalog parser.
Your job is to read the provided catalog page (which contains tables, technical specifications, product IDs, and certification logos) and extract all product models and variants into a strict JSON array.
Focus on identifying the Base SKU or Model name (e.g., DTL-112027) and then mapping out every variant (e.g., 8W, 12W, 15W, etc.) as an individual product.
Also look for certification icons (CE, RoHS, CB, IECEE) and note them.
Output ONLY valid JSON. The JSON must be an array of objects matching this exact structure:
[
  {
    "id": "SKU-OR-MODEL-NUMBER-WATTAGE",
    "name": "Product Series Name - Wattage",
    "specifications": [
      { "key": "Wattage", "value": "15W" },
      { "key": "Luminous Flux", "value": "1275lm" },
      { "key": "Dimension", "value": "86x75x298mm" },
      { "key": "Certifications", "value": "CE, RoHS, CB" }
    ]
  }
]
IMPORTANT: Return ONLY the raw JSON array. Do NOT wrap it in markdown code blocks like \`\`\`json.`;

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { image, provider, apiKey, model, endpoint } = data;

    if (!image || !provider || (!apiKey && provider !== 'local')) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: image, provider, apiKey' }), { status: 400 });
    }

    // Strip the "data:image/jpeg;base64," prefix if present
    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';

    let extractedText = '';

    if (provider === 'google') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              {
                inlineData: {
                  mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error?.message || 'Google API Error');
      }
      
      extractedText = json.candidates[0].content.parts[0].text;
    } 
    else if (provider === 'openai') {
      const url = 'https://api.openai.com/v1/chat/completions';
      const payload = {
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ]}
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error?.message || 'OpenAI API Error');
      }
      
      extractedText = json.choices[0].message.content;
    }
    else if (provider === 'anthropic') {
      const url = 'https://api.anthropic.com/v1/messages';
      const payload = {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: base64Data } }
          ]}
        ],
        temperature: 0.1
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error?.message || 'Anthropic API Error');
      }
      
      extractedText = json.content[0].text;
    } 
    else if (provider === 'openrouter') {
      const url = endpoint || 'https://openrouter.ai/api/v1/chat/completions';
      const payload = {
        model: model || "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ]}
        ],
        temperature: 0.1
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error?.message || 'OpenRouter API Error');
      }
      
      extractedText = json.choices[0].message.content;
    }
    else if (provider === 'deepseek') {
      const url = endpoint || 'https://api.deepseek.com/v1/chat/completions';
      const payload = {
        model: model || "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ]}
        ],
        temperature: 0.1
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error?.message || 'DeepSeek API Error');
      }
      
      extractedText = json.choices[0].message.content;
    }
    else if (provider === 'local') {
      const url = endpoint || 'http://localhost:11434/v1/chat/completions';
      const payload = {
        model: model || "llama3.2-vision",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ]}
        ],
        temperature: 0.1
      };

      const headers: any = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error?.message || 'Local LLM API Error');
      }
      
      extractedText = json.choices[0].message.content;
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Clean up potential markdown formatting just in case
    let cleanJsonStr = extractedText.trim();
    if (cleanJsonStr.startsWith('```json')) {
      cleanJsonStr = cleanJsonStr.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (cleanJsonStr.startsWith('```')) {
      cleanJsonStr = cleanJsonStr.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    let products = [];
    try {
      products = JSON.parse(cleanJsonStr);
      // OpenAI might wrap it in a top-level object if response_format is json_object
      if (!Array.isArray(products) && products.products) {
        products = products.products;
      } else if (!Array.isArray(products) && typeof products === 'object') {
        products = [products];
      }
    } catch (e) {
      throw new Error('AI returned invalid JSON: ' + cleanJsonStr.substring(0, 100) + '...');
    }

    return new Response(JSON.stringify({ success: true, products }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('AI Scan API Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
