import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const urlParam = searchParams.get('url');

  if (!urlParam) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(urlParam);
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch (error) {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  try {
    // Fetch the target URL
    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    
    // Copy headers from the response, excluding security headers that block framing
    const headers = new Headers();
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!['x-frame-options', 'content-security-policy', 'content-encoding'].includes(lowerKey)) {
        headers.set(key, value);
      }
    });

    // If it's HTML, we need to inject the base tag
    if (contentType.includes('text/html')) {
      const htmlBuffer = await response.arrayBuffer();
      const decoder = new TextDecoder('utf-8');
      let html = decoder.decode(htmlBuffer);

      // Inject <base> tag and script to intercept links
      const baseTag = `<base href="${targetUrl.origin}${targetUrl.pathname}">
      <script>
        document.addEventListener('click', function(e) {
          const link = e.target.closest('a');
          if (link && link.href && link.href.startsWith('http')) {
            e.preventDefault();
            window.parent.postMessage({ type: 'BROWSER_NAVIGATE', url: link.href }, '*');
            window.location.href = '/api/proxy?url=' + encodeURIComponent(link.href);
          }
        });
      </script>`;
      
      // Try to inject after <head>
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>\n${baseTag}`);
      } else if (html.includes('<head ')) {
        html = html.replace(/(<head[^>]*>)/i, `$1\n${baseTag}`);
      } else if (html.includes('<html>')) {
        html = html.replace('<html>', `<html>\n<head>${baseTag}</head>`);
      } else {
        html = `${baseTag}\n${html}`;
      }

      return new NextResponse(html, {
        status: response.status,
        headers,
      });
    }

    // For non-HTML content, just stream it back
    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });

  } catch (error: any) {
    console.error('Proxy Error:', error);
    return new NextResponse(`Proxy Error: ${error.message}`, { status: 500 });
  }
}
