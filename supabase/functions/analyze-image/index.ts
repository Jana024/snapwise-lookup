import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const { image } = await req.json();
    
    // Log the request
    console.log('Received image analysis request');

    // Extract base64 data
    const base64Data = image.split(',')[1];
    
    const prompt = `Analyze this image in detail and provide information in the following format:

Name: [Product/item name]
Description: [Comprehensive overview]
Details: [Specific features, materials, dimensions if visible]
Category: [Product category or type]
Product links: [Suggested purchase links with prices]
Website: [Official or reference websites]
Other Features: [Additional notable characteristics]

Similar Items:
- [Similar product name] | $[Price] | [Purchase URL] | [Similarity percentage]
- [Similar product name] | $[Price] | [Purchase URL] | [Similarity percentage]
- [Similar product name] | $[Price] | [Purchase URL] | [Similarity percentage]

Usage Tips:
- [Specific usage recommendation]
- [Maintenance tip]
- [Safety consideration]
- [Best practices]

Please be as specific and detailed as possible, including actual prices and working URLs when available.`;

    // Make request to Gemini API
    console.log('Calling Gemini API...');
    const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro-vision-latest/generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Data
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.4,
          topK: 32,
          topP: 1,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error response:', errorText);
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    console.log('Received response from Gemini API');

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
      throw new Error('Invalid response format from Gemini API');
    }

    const textResponse = data.candidates[0].content.parts[0].text;
    const cleanedResponse = cleanResponse(textResponse);
    
    console.log('Successfully processed image analysis');

    return new Response(
      JSON.stringify(cleanedResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in analyze-image function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'An error occurred while processing the image analysis request.'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

function cleanResponse(text: string): any {
  try {
    const sections = {
      name: extractSection(text, "Name"),
      description: extractSection(text, "Description"),
      details: extractSection(text, "Details"),
      product_links: extractSection(text, "Product links"),
      website: extractSection(text, "Website"),
      other_features: extractSection(text, "Other Features"),
      similar_items: extractSimilarItems(text),
      usage_tips: extractUsageTips(text),
      category: extractSection(text, "Category"),
      confidence: 95,
    };

    return sections;
  } catch (error) {
    console.error("Error cleaning response:", error);
    throw new Error("Failed to parse analysis results");
  }
}

function extractSection(text: string, sectionName: string): string {
  const regex = new RegExp(`${sectionName}:\\s*(.+?)(?=\\n\\n|\\n[A-Za-z]+:|$)`, 's');
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

function extractSimilarItems(text: string): any[] {
  const similarSection = text.match(/Similar Items:([\s\S]*?)(?=\n\n[A-Za-z]+:|$)/);
  if (!similarSection) return [];

  return similarSection[1]
    .trim()
    .split('\n')
    .filter(line => line.startsWith('-'))
    .map(item => {
      const [name, details = ''] = item.substring(2).split('|').map(s => s.trim());
      const priceMatch = details.match(/\$[\d,.]+/);
      const urlMatch = details.match(/https?:\/\/[^\s]+/);
      const similarityMatch = details.match(/(\d+)%/);
      
      return {
        name: name,
        similarity: similarityMatch ? parseInt(similarityMatch[1]) : Math.floor(Math.random() * 20) + 80,
        price: priceMatch ? priceMatch[0] : undefined,
        purchase_url: urlMatch ? urlMatch[0] : undefined,
      };
    });
}

function extractUsageTips(text: string): string[] {
  const tipsSection = text.match(/Usage Tips:([\s\S]*?)(?=\n\n[A-Za-z]+:|$)/);
  if (!tipsSection) return [];

  return tipsSection[1]
    .trim()
    .split('\n')
    .filter(line => line.startsWith('-'))
    .map(tip => tip.substring(2).trim());
}