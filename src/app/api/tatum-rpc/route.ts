import { NextRequest, NextResponse } from "next/server";

const TATUM_MAINNET_URL =
  process.env.NEXT_PUBLIC_TATUM_SUI_RPC || "https://sui-mainnet.gateway.tatum.io";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    const response = await fetch(TATUM_MAINNET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": process.env.TATUM_API_KEY || "",
      },
      body: rawBody,
    });

    const responseText = await response.text();
    return new NextResponse(responseText, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "x-tatum-routed": "sui-mainnet.gateway.tatum.io",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: error.message || "Tatum RPC Proxy Error" },
        id: null,
      },
      { status: 500 }
    );
  }
}
