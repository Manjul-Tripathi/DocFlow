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
    const { query, limit = 10, threshold = 0.7, userId } = await req.json();
    
    if (!query) {
      throw new Error('Query is required for semantic search');
    }

    const litellmApiUrl = Deno.env.get('LITELLM_API_URL');
    const litellmApiKey = Deno.env.get('LITELLM_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!litellmApiUrl || !litellmApiKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Required configuration not found');
    }

    console.log('Processing semantic search for query:', query);

    // Generate embedding for the search query
    const embeddingResponse = await fetch(`${litellmApiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${litellmApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'azure/text-embedding-ada-002',
        input: query,
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error('LiteLLM embedding error:', errorText);
      throw new Error(`Failed to generate query embedding: ${embeddingResponse.status}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build the query with user filtering if userId is provided
    let searchQuery = supabase
      .from('documents')
      .select(`
        id,
        title,
        description,
        file_name,
        file_path,
        extracted_text,
        created_at,
        updated_at,
        document_type,
        file_size,
        processing_status
      `)
      .not('embedding', 'is', null);

    // Add user filtering if userId is provided
    if (userId) {
      searchQuery = searchQuery.eq('user_id', userId);
    }

    const { data: documents, error } = await searchQuery;

    if (error) {
      console.error('Database error:', error);
      throw new Error(`Database query failed: ${error.message}`);
    }

    // Calculate cosine similarity for each document
    const results = documents
      .map(doc => {
        if (!doc.embedding) return null;
        
        // Calculate cosine similarity
        const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
        
        return {
          ...doc,
          similarity,
          relevanceScore: Math.round(similarity * 100)
        };
      })
      .filter(doc => doc && doc.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log(`Found ${results.length} relevant documents`);

    return new Response(JSON.stringify({ 
      results,
      query,
      totalFound: results.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in semantic-search function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to calculate cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}