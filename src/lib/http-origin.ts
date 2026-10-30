// Next.js may normalize loopback URLs to localhost. Use the actual Host header
// for browser origin checks; APP_ORIGIN pins the public URL behind a proxy.
export function requestOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) return new URL(configured).origin;
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.host;
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || url.protocol.slice(0, -1);
  if (!['http', 'https'].includes(protocol)) throw new Error('Invalid request protocol.');
  return new URL(protocol + '://' + host).origin;
}
