export async function POST(req) {
  const { text } = await req.json();

  const response = await fetch('https://api.d-id.com/talks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      script: {
        type: 'text',
        input: text,
      },
      source_url: 'https://d-id-public-bucket.s3.amazonaws.com/amy.jpg',
      config: {
        fluent: true,
        pad_audio: 0.0,
      },
    }),
  });

  const result = await response.json();
  
  if (!response.ok) {
    return Response.json({ error: result }, { status: response.status });
  }

  return Response.json(result);
}
