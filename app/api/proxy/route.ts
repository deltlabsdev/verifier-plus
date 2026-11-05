import { NextRequest } from 'next/server';
import { extractBadgeFromPng, isPng } from '@/lib/bakedPng';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      console.error('No URL provided in request body');
      return Response.json({ error: 'URL is required' }, {
        status: 400,
        headers
      });
    }

    let targetUrl = url;

    try {
      const urlObj = new URL(url);
      // if there is a 'vc' query param then 
      // we want to use the value of that as our url
      const vcUrl = urlObj.searchParams.get('vc');
      if (vcUrl) {
        try {
          // now check the vcURL by parsing it
          new URL(vcUrl)
        } catch (e) {
          console.error("Error parsing the URL in the 'VC' query parameter:", e);
          return Response.json({ error: "Invalid URL format in the 'vc' query parameter" }, {
            status: 400,
            headers
          })
        }
        targetUrl = vcUrl;
      }
    } catch (error) {
      console.error('Error parsing URL:', error);
      return Response.json({ error: 'Invalid URL format' }, {
        status: 400,
        headers
      })
    }

    const response = await fetch(targetUrl);

    if (!response.ok) {
      console.error('Fetch failed:', response.status, response.statusText);

      return Response.json({ error: 'Failed to fetch URL' }, {
        status: response.status,
        headers
      })
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    let data: unknown;

    if (isPng(bytes)) {
      const embedded = await extractBadgeFromPng(bytes);
      if (!embedded) {
        return Response.json({ error: 'PNG does not contain an embedded badge' }, {
          status: 422,
          headers
        })
      }
      if (/^https?:\/\//i.test(embedded)) {
        // OB 2.0 hosted badges bake in the assertion URL rather than the JSON
        const hosted = await fetch(embedded);
        if (!hosted.ok) {
          return Response.json({ error: 'Failed to fetch URL embedded in PNG' }, {
            status: hosted.status,
            headers
          })
        }
        data = await hosted.json();
      } else {
        data = JSON.parse(embedded);
      }
    } else {
      data = JSON.parse(new TextDecoder().decode(bytes));
    }

    return Response.json(data, {
      status: 200,
      headers
    })

  } catch (error) {
    console.error('Proxy error:', error);
    return Response.json({ error: 'Failed to fetch URL' }, {
      status: 500,
      headers
    })
  }
} 