import { NextResponse } from "next/server";

const WORKFLOW_URL =
  "https://serverless.roboflow.com/bui-duc-bang-_fragrance/workflows/kiem-tra-hang-sai-vi-tri";


export async function POST(request: Request) {
  const apiKey = process.env.ROBOFLOW_API_KEY;

  if (!apiKey) {
    
    return NextResponse.json(
      { error: "ROBOFLOW_API_KEY chưa được cấu hình." },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "Vui lòng chọn một ảnh kho." },
        { status: 400 }
      );
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Tệp được chọn không phải là ảnh." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const base64Image = buffer.toString("base64");

    const response = await fetch(WORKFLOW_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs: {
          image: {
            type: "base64",
            value: base64Image,
          },
        },
      }),
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Roboflow error:", result);

      return NextResponse.json(
        {
          error: "Workflow không thể xử lý ảnh.",
          details: result,
        },
        { status: response.status }
      );
    }

    const output = result?.outputs?.[0];

    if (!output) {
      return NextResponse.json(
        { error: "Workflow không trả về kết quả." },
        { status: 502 }
      );
    }

    const outputImage = output.output_image?.value;

   return NextResponse.json({
  outputImage: outputImage
    ? `data:image/jpeg;base64,${outputImage}`
    : null,
  summary: output.audit_summary ?? null,
  correctCount: output.correct_count ?? 0,
  misplacedCount: output.misplaced_count ?? 0,
  unknownCount: output.unknown_count ?? 0,
  misplacedPercent: output.misplaced_percent ?? 0,
  unknownPercent: output.unknown_percent ?? 0,
  isCompliant: output.is_compliant ?? false,
  instructions: output.instructions ?? [],

  // Xác nhận kết quả đã được đồng bộ vào Vision Events
  syncEventId: output.sync_event_id ?? null,
  syncError: output.sync_error ?? false,
  syncMessage: output.sync_message ?? null,
});

  } catch (error) {
    console.error("Warehouse audit failed:", error);

    return NextResponse.json(
      { error: "Không thể kết nối đến dịch vụ kiểm tra kho." },
      { status: 500 }
    );
  }
}
