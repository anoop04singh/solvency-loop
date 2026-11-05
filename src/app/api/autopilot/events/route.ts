import {NextRequest,NextResponse} from 'next/server';
import {dispatchConfirmedBill,verifyDeliverySignature} from '@/lib/autopilot-dispatch';
export const runtime='nodejs';
export const maxDuration=600;
export async function POST(req:NextRequest){
 try{
  const raw=await req.text();if(new TextEncoder().encode(raw).length>2000)return NextResponse.json({error:'Event delivery too large.'},{status:413});
  verifyDeliverySignature(raw,req.headers.get('x-solvency-issued-at')||'',req.headers.get('x-solvency-signature')||'',process.env.AUTOPILOT_WEBHOOK_SECRET||'');
  const body=JSON.parse(raw);if(typeof body.digest!=='string')throw Error('A transaction digest is required.');
  const results=await dispatchConfirmedBill(body.digest);return NextResponse.json({results},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Event delivery was not accepted. Verify authorization and retry confirmed, idempotent events.'},{status:403});}
}
