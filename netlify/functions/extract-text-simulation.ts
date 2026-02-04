// Edge Function: extract-text
// Parses text from Images (OCR) and PDFs

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Note: In a real deployment, we would use Tesseract.js (for images) or pdf-parse (for PDFs).
// For this "Prosumer" MVP, we will simulate extraction or use a lightweight mock to show architecture.
// Real OCR usually requires heavier libraries not suitable for basic Edge runtime limits (10MB).
// We would typically call an external API (Google Vision, AWS Textract) here.

serve(async (req) => {
  const { record } = await req.json(); // Triggered by Storage Webhook or DB Insert

  if (!record || !record.file_meta || !record.file_meta.path) {
    return new Response(JSON.stringify({ message: 'No file to process' }), { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const fileType = record.type;
  const filePath = record.file_meta.path;
  let extractedText = '';

  try {
    // 1. Download File
    const { data: fileBlob, error: downloadError } = await supabase
      .storage
      .from('stash_vault')
      .download(filePath);

    if (downloadError) throw downloadError;

    // 2. Extract Text (Simulation for this environment)
    // In production, send `fileBlob` to Google Cloud Vision API or similar.
    
    if (fileType === 'file' && record.file_meta.mime === 'application/pdf') {
       // Simulate PDF Text Extraction
       extractedText = `Extracted content from ${record.title}... (Mock)`; 
    } else if (fileType === 'image') {
       // Simulate OCR
       extractedText = `Image text from ${record.title}... (Mock)`;
    }

    // 3. Update Database
    if (extractedText) {
      await supabase
        .from('items')
        .update({ search_text: extractedText })
        .eq('id', record.id);
    }

    return new Response(JSON.stringify({ message: 'Text extracted', text: extractedText }), { status: 200 });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
