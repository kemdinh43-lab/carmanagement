import { NextResponse } from "next/server";

type FinalOrderPayload = {
  order_no?: unknown;
  delivery?: {
    schema?: unknown;
    filename?: unknown;
  };
};

function webhookConfig() {
  return {
    secret: process.env.N8N_FINAL_ORDER_WEBHOOK_SECRET,
    url: process.env.N8N_FINAL_ORDER_WEBHOOK_URL
  };
}

function validatePayload(payload: FinalOrderPayload | null) {
  if (!payload || typeof payload !== "object") return "Payload không hợp lệ.";
  if (typeof payload.order_no !== "string" || payload.order_no.trim().length === 0) return "Thiếu mã lệnh điều xe.";
  if (payload.delivery?.schema !== "aot_final_dispatch_order_pdf_v1") return "Sai schema payload PDF.";
  return null;
}

export async function POST(request: Request) {
  const { secret, url } = webhookConfig();
  if (!url) {
    return NextResponse.json(
      {
        error: "Chưa cấu hình N8N_FINAL_ORDER_WEBHOOK_URL trên server/Vercel.",
        message: "Tải Payload n8n để test thủ công, hoặc thêm webhook URL rồi bấm Gửi n8n."
      },
      { status: 501 }
    );
  }

  const payload = (await request.json().catch(() => null)) as FinalOrderPayload | null;
  const validationError = validatePayload(payload);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const finalPayload = payload as FinalOrderPayload & { order_no: string };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-aot-webhook-secret": secret } : {})
      },
      body: JSON.stringify(finalPayload)
    });
  } catch (error) {
    return NextResponse.json({ error: `Không gọi được n8n webhook: ${error instanceof Error ? error.message : "unknown error"}` }, { status: 502 });
  }

  const text = await response.text();
  let n8nResponse: unknown = text;
  try {
    n8nResponse = text ? JSON.parse(text) : null;
  } catch {
    n8nResponse = text.slice(0, 1000);
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        error: `n8n webhook lỗi HTTP ${response.status}.`,
        n8nResponse
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `Đã gửi lệnh ${finalPayload.order_no} sang n8n để tạo PDF.`,
    n8nResponse
  });
}
