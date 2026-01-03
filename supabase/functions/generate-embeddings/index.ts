import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, documentId } = await req.json();
    
    if (!text) {
      throw new Error('Text is required for embedding generation');
    }

    const litellmApiUrl = Deno.env.get('LITELLM_API_URL');
    const litellmApiKey = Deno.env.get('LITELLM_API_KEY');
    
    if (!litellmApiUrl || !litellmApiKey) {
      throw new Error('LiteLLM configuration not found');
    }

    console.log('Generating embeddings for text length:', text.length);

    // Generate embeddings using LiteLLM
    const embeddingResponse = await fetch(`${litellmApiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${litellmApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'azure/text-embedding-ada-002',
        input: text,
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error('LiteLLM embedding error:', errorText);
      throw new Error(`Failed to generate embeddings: ${embeddingResponse.status}`);
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.data[0].embedding;

    console.log('Generated embedding with dimensions:', embedding.length);

    // If documentId is provided, update the document with embedding
    if (documentId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        const { error } = await supabase
          .from('documents')
          .update({ embedding })
          .eq('id', documentId);
        
        if (error) {
          console.error('Failed to update document embedding:', error);
        } else {
          console.log('Successfully updated document embedding');
        }
      }
    }

    return new Response(JSON.stringify({ 
      embedding,
      dimensions: embedding.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-embeddings function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});