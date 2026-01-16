import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const json = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const errorJson = (message: string, upstreamStatus?: number) =>
  json({ error: message, ...(upstreamStatus ? { upstreamStatus } : {}) });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId, accessToken, mimeType } = await req.json();

    if (!fileId || !accessToken) {
      return errorJson("缺少必要參數");
    }

    console.log(`Downloading file ${fileId} from Google Drive...`);

    // Download file from Google Drive
    const fileResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!fileResponse.ok) {
      const errorText = await fileResponse.text();
      console.error("Google Drive download error:", fileResponse.status, errorText);
      return errorJson("無法從 Google Drive 下載檔案", fileResponse.status);
    }

    const fileBuffer = await fileResponse.arrayBuffer();

    // Convert to base64 in chunks to avoid stack overflow
    const uint8Array = new Uint8Array(fileBuffer);
    let base64 = "";
    const chunkSize = 32768; // Process in 32KB chunks
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      base64 += String.fromCharCode.apply(null, Array.from(chunk));
    }
    base64 = btoa(base64);

    console.log(`File downloaded, size: ${fileBuffer.byteLength} bytes`);

    // Process with Gemini OCR
    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GOOGLE_GEMINI_API_KEY) {
      console.error("GOOGLE_GEMINI_API_KEY is not configured");
      return errorJson("Google Gemini API key not configured");
    }

    const systemPrompt = `你是一個專業的 OCR 文字辨識專家。你的任務是從圖片中精確提取所有文字內容。

重要規則：
1. 精確辨識所有文字，包括：
   - 分數符號（如 ½, ⅓, ¼ 等）
   - 上下標（如 x², H₂O）
   - 希臘字母（如 α, β, γ）
   - 特殊數學符號
2. 保持原始格式和排版
3. 對於表格，嘗試保持對齊
4. 只返回辨識出的文字內容，不要加入任何解釋或評論
5. 如果有多頁，用 "=== 第 X 頁 ===" 分隔
6. 對於模糊或不確定的文字，用 [?] 標記`;

    // For PDFs, we send it directly and let Gemini handle it
    let actualMimeType = mimeType;
    if (mimeType === "application/pdf") {
      actualMimeType = "application/pdf";
    }

    const requestUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=" +
      GOOGLE_GEMINI_API_KEY;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text:
                systemPrompt +
                "\n\n請仔細辨識這份檔案中的所有文字內容，特別注意技術規格、型號編號、分數和特殊符號。",
            },
            {
              inline_data: {
                mime_type: actualMimeType,
                data: base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192,
      },
    };

    // Gemini occasionally returns 503 "model overloaded" during bursts.
    // Add retry + backoff to reduce transient failures.
    const maxAttempts = 3;
    let geminiResponse: Response | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      geminiResponse = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (geminiResponse.ok) break;

      const status = geminiResponse.status;
      const errorText = await geminiResponse.text();
      console.error(
        `Gemini API error (attempt ${attempt}/${maxAttempts}):`,
        status,
        errorText
      );

      const retriable = [429, 500, 502, 503, 504].includes(status);

      if (!retriable || attempt === maxAttempts) {
        if (status === 429) {
          return errorJson(
            "已超出目前配額/速率限制（429），請稍後再試",
            429
          );
        }
        if (status === 403) {
          return errorJson(
            "API Key 無效或沒有權限（403），請檢查金鑰/服務是否開通",
            403
          );
        }
        if (status === 503) {
          return errorJson(
            "模型目前忙碌（503），已自動重試仍失敗，請稍後再試",
            503
          );
        }
        return errorJson("OCR 處理失敗", status);
      }

      // Backoff with jitter
      const base = status === 429 ? 5000 : 800;
      const backoff = status === 429 ? base * attempt : base * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 250);
      await sleep(backoff + jitter);
    }

    if (!geminiResponse || !geminiResponse.ok) {
      return errorJson("OCR 處理失敗");
    }

    const geminiData = await geminiResponse.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log("OCR completed, text length:", text.length);

    return json({ text, confidence: 95 });
  } catch (error) {
    console.error("Error:", error);
    return errorJson(error instanceof Error ? error.message : "處理過程中發生錯誤");
  }
});
