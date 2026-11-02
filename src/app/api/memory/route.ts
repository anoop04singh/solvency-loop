import {NextRequest} from 'next/server';
import {handleMemoryRequest} from '@/lib/memory-route';
export const runtime='nodejs';
export const maxDuration=600;
export function POST(req:NextRequest){return handleMemoryRequest(req);}
