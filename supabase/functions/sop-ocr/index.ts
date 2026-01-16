import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 步驟代碼表
const STEP_CODE_TABLE: Record<string, string> = {
  "SMT": "101",
  "DIP": "102",
  "裁線": "201",
  "處理線": "202",
  "處理線I": "203",
  "處理線II": "204",
  "處理線III": "205",
  "后端處理": "206",
  "穿外殼及SR": "207",
  "組裝": "208",
  "超音波熔接": "209",
  "鉚合端子": "301",
  "插HOUSING": "302",
  "焊線": "310",
  "焊PCB": "311",
  "PCB與插頭焊接": "312",
  "H/B焊接": "313",
  "隔離": "314",
  "處理光纖線": "401",
  "排纖": "402",
  "並纖": "403",
  "穿纖": "404",
  "鉚止動環": "405",
  "打膠": "406",
  "打膠固化": "407",
  "熱剝": "408",
  "鐳切": "409",
  "藕合": "410",
  "端面檢查": "411",
  "成型內模": "501",
  "成型外模": "502",
  "成型SR": "503",
  "成型防塵蓋": "504",
  "成型螺絲": "505",
  "成型分線夾": "506",
  "測試I": "601",
  "測試II": "602",
  "測試III": "603",
  "測試IV": "604",
  "測試V": "605",
  "測試/終測": "606",
  "目檢": "607",
  "XRF測試": "608",
  "特性測試": "609",
  "全檢": "701",
  "尺寸量測": "702",
  "裝袋": "801",
  "貼標簽": "802",
  "拆箱": "803",
  "包裝": "804",
  "擦油": "805",
  "鉚合": "210",
  "吹热缩管": "211",
  "鎖螺絲": "212",
  "对比剪": "213",
  "排線&刺破": "214",
  "裁線+處理線": "215",
  "焊地线": "315",
  "架接": "316",
  "焊线II": "317",
  "终檢": "703",
  "成型塞豆": "507",
  "成型鐵芯": "508",
  "成型中模": "509",
  "成型SR內模": "510",
  "成型墊片": "511",
  "加工印字热缩管": "901",
  "測試VI": "610",
  "成型內模I": "512",
  "成型外模I": "513",
  "外包加工": "A01",
  "檢查FPC": "704",
  // 焊接相關
  "焊接": "310",
  "焊接1": "310",
  "焊接2": "310",
  "焊接3": "310",
  "焊接4": "310",
};

// 序號對應表
const SEQUENCE_MAP: Record<number, string> = {
  10: "10", 20: "20", 30: "30", 31: "31", 32: "32", 33: "33", 34: "34", 35: "35",
  40: "40", 41: "41", 42: "42", 43: "43", 44: "44", 45: "45",
  50: "50", 51: "51", 52: "52", 53: "53", 54: "54", 55: "55",
  60: "60", 61: "61", 62: "62", 63: "63", 64: "64", 65: "65",
  70: "70", 71: "71", 72: "72", 73: "73", 74: "74", 75: "75",
  80: "80", 81: "81", 82: "82", 83: "83", 84: "84", 85: "85",
  90: "90", 91: "91", 92: "92", 93: "93", 94: "94", 95: "95",
  100: "A0", 101: "A1", 102: "A2", 103: "A3", 104: "A4", 105: "A5",
  110: "B0", 111: "B1", 112: "B2", 113: "B3", 114: "B4", 115: "B5",
  120: "C0", 121: "C1", 122: "C2", 123: "C3", 124: "C4", 125: "C5",
  130: "D0", 131: "D1", 132: "D2", 133: "D3", 134: "D4", 135: "D5",
  140: "E0", 141: "E1", 142: "E2", 143: "E3", 144: "E4", 145: "E5",
  150: "F0", 151: "F1", 152: "F2", 153: "F3", 154: "F4", 155: "F5",
};

// 反向查詢：從第二欄代碼找序號
function getSequenceNumber(code: string): number {
  for (const [num, c] of Object.entries(SEQUENCE_MAP)) {
    if (c === code) return parseInt(num);
  }
  return 0;
}

// 查詢步驟代碼（忽略數字後綴來匹配）
function findStepCode(stepName: string): string | null {
  // 直接匹配
  if (STEP_CODE_TABLE[stepName]) {
    return STEP_CODE_TABLE[stepName];
  }
  
  // 移除數字後綴再匹配（如 "焊接1" -> "焊接"）
  const baseStep = stepName.replace(/\d+$/, '').trim();
  if (STEP_CODE_TABLE[baseStep]) {
    return STEP_CODE_TABLE[baseStep];
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image data provided" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 優先使用用戶自己的 OpenAI API Key，否則使用 Lovable AI
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    const useOpenAI = !!OPENAI_API_KEY;
    const apiKey = useOpenAI ? OPENAI_API_KEY : LOVABLE_API_KEY;
    const apiUrl = useOpenAI 
      ? "https://api.openai.com/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const modelName = useOpenAI ? "gpt-4o" : "openai/gpt-5.2";
    
    if (!apiKey) {
      console.error("No API key configured (OPENAI_API_KEY or LOVABLE_API_KEY)");
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Processing SOP workflow with ${useOpenAI ? 'OpenAI (user key)' : 'Lovable AI'}...`);

    // ========== 第一階段：Vision 分析圖片 ==========
    const phase1Prompt = `請仔細分析這張工作流程圖，辨識所有的：
1. 流程方塊/節點中的文字
2. 箭頭的連接順序和方向
3. 分支點（如果有多個路徑）

請逐一列出你看到的所有元素，包括：
- 每個方塊的文字內容
- 箭頭的走向（從哪個方塊指向哪個方塊）
- 如果有並行或分支，請註明

注意：請仔細查看是否有多個焊接點（如USB公頭和母頭需要焊接兩次）。`;

    const phase1Body = {
      model: modelName,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: phase1Prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/png"};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    };

    let phase1Response: Response | null = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      phase1Response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(phase1Body),
      });

      if (phase1Response.ok) break;

      const status = phase1Response.status;
      console.error(`Phase 1 Vision API error (attempt ${attempt}/${maxAttempts}):`, status);

      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "API 速率限制，請稍後再試", upstreamStatus: 429 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "API 額度不足，請加值", upstreamStatus: 402 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (attempt < maxAttempts) {
        await sleep(1000 * attempt);
      }
    }

    if (!phase1Response || !phase1Response.ok) {
      return new Response(
        JSON.stringify({ error: "Vision 分析服務暫時無法使用" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const phase1Data = await phase1Response.json();
    const visionResult = phase1Data.choices?.[0]?.message?.content || "";

    console.log("Phase 1 Vision result:", visionResult);

    // ========== 第二階段：Completion 整理格式 ==========
    const phase2Prompt = `根據以下從工作流程圖中提取的內容，請依照箭頭順序整理成標準格式。

【圖片分析結果】
${visionResult}

【輸出規則】
1. 如果有多個焊接點（如USB公頭及母頭），必須分開列出，例如：
   050,50,焊接1
   051,51,焊接2

2. 序號規則：
   - 010,020,030... 每10遞增
   - 分支用 031,032,033... 或 051,052...
   - 超過90用 A0,B0,C0...

3. 只輸出格式化結果，不需要說明

【輸出格式】
010,10,步驟名稱
020,20,步驟名稱
030,30,步驟名稱
...`;

    const phase2Body = {
      model: modelName,
      messages: [
        {
          role: "user",
          content: phase2Prompt,
        },
      ],
      max_tokens: 4096,
    };

    let phase2Response: Response | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      phase2Response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(phase2Body),
      });

      if (phase2Response.ok) break;

      const status = phase2Response.status;
      console.error(`Phase 2 Completion API error (attempt ${attempt}/${maxAttempts}):`, status);

      if (status === 429 || status === 402) {
        // 已在第一階段處理，這裡直接返回
        return new Response(
          JSON.stringify({ error: "API 服務限制，請稍後再試", upstreamStatus: status }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (attempt < maxAttempts) {
        await sleep(1000 * attempt);
      }
    }

    if (!phase2Response || !phase2Response.ok) {
      return new Response(
        JSON.stringify({ error: "格式整理服務暫時無法使用" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const phase2Data = await phase2Response.json();
    const phase2Result = phase2Data.choices?.[0]?.message?.content || "";

    console.log("Phase 2 Completion result:", phase2Result);

    // ========== 第三階段：轉換代碼 ==========
    // 解析第二階段結果並對照代碼表
    const lines = phase2Result.split('\n').filter((line: string) => line.trim());
    const parsedSteps: Array<{ seq: string; code: string; stepCode: string; stepName: string }> = [];

    for (const line of lines) {
      // 匹配格式: 010,10,XXX 或 010,10,,XXX
      const match = line.match(/^(\d+),\s*([A-Z0-9]+),+\s*(.+)$/i);
      if (match) {
        const seq = match[1];
        const code = match[2];
        const stepName = match[3].trim();
        
        const stepCode = findStepCode(stepName);
        
        if (stepCode) {
          parsedSteps.push({
            seq,
            code,
            stepCode,
            stepName,
          });
        }
      }
    }

    // 格式化最終輸出
    const finalOutput = parsedSteps.map((step, idx) => {
      const isLast = idx === parsedSteps.length - 1;
      return `["${step.seq}","${step.code}",${step.stepCode},"${step.stepName}"]${isLast ? '' : ','}`;
    }).join('\n');

    console.log("SOP processing completed, steps found:", parsedSteps.length);

    return new Response(
      JSON.stringify({
        text: finalOutput,
        rawVision: visionResult,
        rawCompletion: phase2Result,
        parsedSteps,
        confidence: 95,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("SOP processing error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "處理過程中發生錯誤",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});