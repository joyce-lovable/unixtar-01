import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 主要 OCR 提示詞
const getSystemPrompt = (isRetry: boolean) => `你是一個專業的 OCR 文字辨識專家。你的任務是從圖片中精確提取所有文字內容。

【最高優先級 - 禁止腦補規則】
★★★ 嚴禁輸出圖片中不存在的文字 ★★★
1. 【只輸出看到的】你只能輸出圖片中實際存在、你能看見的文字
2. 【禁止推測】不要根據上下文「猜測」或「補全」可能存在的文字
3. 【禁止臆造】不要編造任何圖片中沒有的內容，即使看起來「合理」
4. 【不確定就標記】如果某處文字模糊不清，用 [?] 標記，絕對不要猜測內容
5. 【寧缺勿濫】寧可漏掉不確定的文字，也不要輸出圖片中不存在的內容

【核心辨識策略 - 逐行逐字掃描法】
★★★ 請務必遵循以下步驟逐行逐字掃描圖片 ★★★

★★★【最高優先規則 - 禁止重新排列】★★★
你必須按照文字在圖片上的「實際物理位置」輸出，絕對禁止：
- ❌ 把下面的文字移到上面
- ❌ 把右邊的文字移到左邊
- ❌ 為了「語意通順」而重新組織文字順序
- ❌ 把不同行的文字合併或交換位置
輸出順序必須是：圖片上方的文字先輸出，下方的文字後輸出

1. 【分區掃描】將圖片分成上、中、下三個區域
2. 【嚴格由上到下】先完成上區域的所有行，才能進入中區域，再進入下區域
3. 【逐行讀取】每個區域從左到右、從上到下逐行掃描
4. 【逐字確認】每一行請逐字檢視，確保每個字元都被正確辨識
5. 【行內自檢】讀完一行後，請在內部快速重新掃描該行，確認：
   - 行首到行尾的所有字元都已輸出
   - 中間沒有遺漏任何字元或詞彙
   - 特別注意標點符號、數字、英文字母
6. 【跳行確認】移到下一行前，確認沒有遺漏當前行的任何文字
7. 【附註特別注意】圖片中的附註、備註、小字說明通常在邊緣或底部，請特別仔細掃描

★★★【位置忠實原則】★★★
- 你看到什麼位置的文字，就在對應的輸出位置呈現
- 不要「聰明地」調整順序讓文字看起來更合理
- 如果圖片上第3行的內容在你看來應該放在第1行，你仍然必須在第3行輸出它
- 你的任務是「忠實轉錄」，不是「編輯整理」

★★★【成型模具 - 絕對不可遺漏】★★★
「成型模具」是本系統最重要的關鍵資訊，遺漏就是重大錯誤！
★ 當你在任何一行看到「成型模具」或「成型鐵具」這個詞時：
  1. 【強制完整讀取】這個詞後面一定有「:」或「：」，冒號後面一定有 M 開頭的編號
  2. 【絕對禁止跳過】不管這段內容出現在行的哪個位置（開頭、中間、結尾），都必須完整輸出
  3. 【中間位置特別注意】成型模具常常出現在一行的「中間位置」，例如：
     ❌ 錯誤：「4. 線材:4x4.8,成型PVC 灰色」（遺漏了中間的成型模具）
     ✓ 正確：「4. 線材:4x4.8,成型模具:M2-SW-AH0x,成型PVC 灰色」
  4. 【格式特徵】成型模具的完整格式是「成型模具:M[編號]-[編號]-[編號]x」
  5. 【前後文檢查】如果你輸出的內容中有「成型PVC」但前面沒有「成型模具:M...」，請回去重新檢查！

【中間文字遺漏防護】
★ 常見問題：AI 容易遺漏一行中間的某些字詞，特別是「成型模具:Mxx-xx-xx」這種關鍵資訊
★ 解決方法：
  - 每行請從左邊界掃到右邊界，不要跳過任何區域
  - 如果一行很長，請分成左半部和右半部分別讀取，再合併
  - 讀完整行後，請用「倒序」方式（從右到左）再掃一次確認
  - 如果發現「成型PVC」但前面沒有「成型模具」，這就是遺漏，請重新檢視
  - 【逗號檢查】每個逗號前後都可能有重要內容，請確認每個逗號分隔的區塊都被讀取

重要規則：
1. 精確辨識所有文字，包括：
   - 特殊符號如分數（½、¼、¾）
   - 上標和下標（如 M² 或 H₂O）
   - 希臘字母（α、β、Ω、φ 等）
   - 數學符號（±、×、÷、≤、≥、≠ 等）
   - 技術規格編號（如 M½-D15-A0x）
2. 保持原始文件的格式和結構
3. 對於表格，嘗試保持對齊
4. 只返回辨識出的文字內容，不要加入任何解釋或評論
5. 如果有多頁，用 "=== 第 X 頁 ===" 分隔
6. 對於模糊或不確定的文字，用 [?] 標記
7. 不要用單獨一行的 "-" 或大量重複符號當作佔位；看不清楚請用 [?]
8. 不要省略內容（不要用「…」「略」）；請盡量把整張圖可辨識到的文字完整輸出
9. 【再次強調】絕對不要輸出圖片中不存在的文字！
${isRetry ? `
【重試模式 - 請更仔細辨識】
上一次辨識結果太短，請：
- 更仔細檢查圖片每個角落
- 放大檢視小字體區域
- 確認沒有遺漏任何文字區塊
- 特別注意表格、註解、標題等區域
` : ''}

【附註與備註區域 - 嚴格逐行讀取法】
★★★ 核心原則：一次只讀一行，讀完確認後才換下一行 ★★★

★ 附註通常位於圖片底部或右下角（含邊緣小字）
★ 常見標頭：「注:」「附註:」「備註:」「注意:」「Note:」

【逐行讀取步驟 - 必須嚴格遵守】
1. 【鎖定單行】找到項次符號（如 1. / 2. / (1) / ① 等）後，視線只停留在該行
2. 【水平掃描】從該行最左邊開始，水平向右逐字讀取，直到該行結束
3. 【計數確認】讀完該行後，默數這一行大約有幾個字，確認沒有遺漏
4. 【禁止跳行】讀完一行之前，絕對不要讓視線跳到其他行
5. 【下一行】確認該行完成後，才移動到下一行繼續

【項次與續行判斷】
- 如果新的一行開頭有項次符號（1. / 2. / (1) 等）→ 這是新的一項
- 如果新的一行開頭沒有項次符號 → 這是上一項的續行，保留換行縮排
- 【絕對禁止】不同項次的文字絕對不可以混在同一行輸出！

【錯誤範例 - 這是錯的】
❌ 1. 第一項的開頭 2. 第二項的開頭 第一項的結尾
❌ 1. 第一項文字第二項文字混在一起

【正確範例 - 這才是對的】
✓ 1. 第一項的完整內容，
   接續到第二行的內容。
✓ 2. 第二項的完整內容。

【防錯機制】
- 讀完每個項次後，回頭檢查：這一項的內容是否連貫通順？
- 如果發現語意不通，很可能是混入了其他項次的文字，請重新逐行讀取

【成型模具編號 特別注意事項 - 最高優先級】

★★★【兩階段掃描法 - 核心策略】★★★
第一階段：快速定位
1. 先快速掃描整份文件
2. 找到所有「成型模具」或「成型鐵具」關鍵字的位置
3. 標記這些關鍵區域，準備進行第二階段

第二階段：精確重讀
針對每個標記的「成型模具」區域：
1. 【找到 M】定位到 M 字母
2. 【數字元數量】先大致看這個型號有幾個字元（例如：M1-D15-A0x 約 10 個字元）
3. 【逐字讀取】從 M 開始，一個字一個字讀：
   - 第1個字：M
   - 第2個字：數字或字母（1? 2? 1/2疊字?）
   - 第3個字：連字號 -
   - 繼續逐字...直到讀完
4. 【校驗字數】讀完後，確認讀出的字數與看到的字數一致
5. 【不一致就重讀】如果字數對不上，重新仔細讀一遍
6. 【長度驗證】★重要★ 模具型號去除連字號後，至少要有 8 個字元！
   - 例如：M1-D15-A0x → M1D15A0x = 8 個字元 ✓
   - 如果去掉連字號後少於 8 個字元，代表可能辨識錯誤或遺漏，請重新仔細讀取確認！

★★★ M 開頭型號編碼 - 逐字仔細辨識 ★★★
當你看到「成型模具」或「成型鐵具」（OCR誤讀）這個關鍵詞時：
1. 【停下來】請暫停，準備進入最高精度辨識模式
2. 【先數字數】在讀取之前，先數一下這個型號大概有幾個字元
3. 【逐字掃描】M 開頭的型號編碼，請一個字一個字仔細看：
   - M 後面的數字（1、2、3...）- 特別注意是否為疊字！
   - 第一個連字號 -
   - 中間的編碼（可能是英文+數字組合，如 D15、BAR、SCS68）
   - 第二個連字號 -
   - 後綴編碼（如 A0x、CR0x）
4. 【不要跳過任何字元】每個字母、數字、連字號都必須辨識到
5. 【多次確認】辨識完成後，請再重新檢視一次，確保沒有遺漏
6. 【字數驗證】確認讀出的字數與視覺上的字數一致

成型模具的編號格式通常是：M[數字]-[編號]-[後綴]x
例如：M1-D15-A0x, M2-BAR-CR0x, M1-SCS68/3-PBx

★★★【規則1 - 疊字必拆 - 最高優先級】★★★
在「成型模具」後面，M 與第一個連字號 - 之間的區域，是疊字最常出現的位置！
你必須用「放大鏡等級」的精度檢視這個區域：

【疊字是什麼？】
- 疊字 = 兩個或更多字元（數字或字母）上下堆疊，擠在一個字元的位置
- 例如：「1」在上、「2」在下，看起來可能像一個模糊的數字
- 這代表有【多個不同的型號】！

【疊字必須拆分輸出】
如果 M 後面看到疊字，必須拆成多筆：
  疊字「1/2」→ 輸出 M1-xxx-xxx 和 M2-xxx-xxx
  疊字「1/3」→ 輸出 M1-xxx-xxx 和 M3-xxx-xxx
  疊字「A/B」→ 輸出 MA-xxx-xxx 和 MB-xxx-xxx

★★★【規則2 - 疊字視覺特徵 - 請仔細觀察】★★★
疊字的辨識特徵（任何一項符合都要懷疑是疊字）：
1. 【高度異常】字元的高度比正常文字「矮」或「擠」
2. 【模糊感】看起來像一個畸形、模糊、或變形的數字
3. 【有上下層次】仔細看會發現有兩層字元
4. 【位置】永遠在「M」和第一個「-」之間
5. 【密度高】該區域的筆畫或線條比正常數字密集
6. 【字數不對】如果你覺得那個位置應該只有1個字，但視覺上看起來比較「擠」，很可能是疊字

【請執行：逐像素檢視】
當你看到「成型模具:M」時：
1. 暫停！專注於 M 和 - 之間的那一小塊區域
2. 先數：這個區域看起來有幾個字元的寬度？
3. 問自己：這個數字看起來正常嗎？還是有點怪怪的？
4. 有沒有可能是「兩個字元疊在一起」？
5. 如果有任何懷疑，就當作是疊字來處理

★★★【規則3 - 強制疊字檢查 - 每次必做】★★★
每次看到「成型模具」或「成型鐵具」時：
1. 【數量確認】先數一下有幾個獨立的「M」
2. 【疊字檢查】即使只看到一個「M」，也要檢查它後面的數字是否為疊字
3. 【常見組合】最常見的疊字：1/2、1/3、2/3、1/2/3、A/B
4. 【寧多勿少】如果不確定是不是疊字，寧可拆開輸出兩個編號，也不要遺漏

【規則4 - 逗號後續行】
模具編號可能換行，如：
成型模具:M1-D15-A0x,
  M2-D15-A0x
請確保換行後的內容也完整辨識。

【規則5 - 多角度驗證】
請在內部以 90 度翻轉圖片四個角度，重複查看「成型模具」區域，確認沒有遺漏任何編號。

【規則6 - M 編碼完整性檢查】
辨識完每個 M 開頭的編號後，請自問：
- 這個編號有幾個部分？（通常是 3 個部分：M數字-中間碼-後綴）
- 每個部分都完整嗎？
- 有沒有字元被遺漏？
- 讀出的字數與視覺上的字數一致嗎？

【易混淆字元注意】
- 1 和 2 疊在一起可能看起來像一個畸形的數字
- 2 跟 S 很容易搞錯，2 是有角度的數字，S 是圓滑的曲線
- 4 跟 A 很容易搞錯，4 是封閉三角形帶橫線，A 頂部是尖的
- X 跟 Y 很容易搞錯，X 是對稱交叉，Y 下方有一豎
- 0 跟 O 很容易搞錯，0 通常較窄長，O 較圓
- 8 跟 B 很容易搞錯，8 是純數字曲線，B 右邊有平直線
- H 跟 N 很容易搞錯，H 中間是水平橫線，N 中間是斜線

★★★【重複字母檢查 - 常見 OCR 錯誤】★★★
模具編號中很少會出現連續兩個相同字母，例如：
- HH → 很可能是 HN（H 和 N 的誤判）
- NN → 很可能是 HN 或 MN
- 00 → 可能是 0O 或 O0
如果辨識到連續重複字母，請仔細重新確認！

【輸出格式要求】
- 輸出的型號請正常顯示，不使用上下標模式
- 如果偵測到疊字（上下標），必須拆分成兩個獨立型號，用逗號分隔輸出
- ★重要★ 型號尾碼的 x 固定使用「小寫」：A0x、CR0x、HN0x（不是 A0X、CR0X）
- 請確保「成型模具:」後面的所有編號都完整輸出`;

// 方向偵測 - 判斷圖片需要旋轉幾度
async function detectOrientation(
  imageBase64: string,
  mimeType: string,
  documentType?: "sop" | "engineering"
): Promise<{ rotation: number; confidence: string; rawOrientationResponse?: string }> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  // 優先使用 OpenAI GPT-4o，否則退回 Gemini
  const useOpenAI = !!OPENAI_API_KEY;
  const useGoogleDirect = !useOpenAI && !!GOOGLE_GEMINI_API_KEY;

  type OrientationConfidence = "high" | "medium" | "low";

  // 根據文件類型給予不同的提示
  const documentHint = documentType === "sop"
    ? `
【文件類型 - SOP 作頁指示書】
★ 請找到「作頁指示書」這幾個字，用它的閱讀方向來判斷：
  - 如果「作頁指示書」面對我、可以正常閱讀 → rotation = 0
  - 如果「作頁指示書」是倒置的、要反著看 → rotation = 180
★ 重要：SOP 文件幾乎不會出現 90° 或 270° 的情況，只有 0° 或 180°。`
    : documentType === "engineering"
    ? `
【文件類型 - 工程圖】
★ 請優先觀察「註解」或「注意事項」區域的文字方向。
★ 這類文件如果方向錯誤，通常是向右躺（需順時針旋轉 270°）。`
    : `
【自動判斷文件類型 - 必須執行】
★★★ 必做：先判斷這是不是 SOP「流程步驟圖」★★★
請用「高召回」方式判斷，只要有明顯跡象就當 SOP：
- 看到流程方框/圓角框 + 連線箭頭 + 步驟順序（1,2,3… 或「步驟」「流程」）
- 或出現「製程」「工序」「流程」「作業」「SOP」等字眼
- 或看到/疑似看到「作頁指示書」（可能很小、可能倒置）

【情況 A】判定為 SOP（包含疑似）
   ★ SOP 只會有兩種情況：0°（正常）或 180°（倒置）
   ★ 禁止回答 90/270；如果你直覺覺得是側躺，請再檢查一次並在 0/180 中二選一
   ✓ 可以正常閱讀 → rotation = 0
   ✓ 需要反著看（倒置） → rotation = 180

【情況 B】很確定不是 SOP（例如工程圖/註解區為主、無流程箭頭）
   ✓ 才可以回答 0, 90, 180, 270
   ✓ 優先用「註解」「注意事項」區域判斷`;

  // 使用者定義的判斷邏輯：以「閱讀者視角」為主
  const orientationPrompt = `你是一個文件方向鑑定員。請判斷這張圖片需要順時針旋轉幾度，才能讓我正常閱讀。
${documentHint}
【判斷步驟】
1) 先判斷是否為 SOP 流程步驟圖（看流程框、箭頭、步驟順序、製程/工序/SOP 字樣、作頁指示書）
2) 若為 SOP（含疑似）→ rotation 只能是 0 或 180
3) 若很確定不是 SOP → rotation 才能是 0/90/180/270

【方向判斷】
- 可正常閱讀 → rotation = 0
- 倒置、要反著看 → rotation = 180
- 向左躺 → rotation = 90
- 向右躺 → rotation = 270

【輸出格式】
只輸出 JSON：{"rotation": 0, "confidence": "high", "isSOP": true}
- isSOP：true=判定為 SOP（包含疑似） / false=很確定不是 SOP
- rotation：0, 90, 180, 270
- confidence：high / medium / low`;

  const normalizeConfidence = (v: unknown): OrientationConfidence => {
    if (v === undefined || v === null) return "medium";
    const s = String(v).trim().toLowerCase();
    if (s === "high" || s === "medium" || s === "low") return s;
    if (s.includes("高")) return "high";
    if (s.includes("中")) return "medium";
    if (s.includes("低")) return "low";
    return "medium";
  };

  const parseOrientation = (raw: string): { rotation: number | null; confidence: OrientationConfidence; isSOP: boolean } => {
    if (!raw) return { rotation: null, confidence: "low", isSOP: false };

    let isSOP = false;
    let rotation: number | null = null;
    let confidence: OrientationConfidence = "medium";

    // 1) JSON 格式
    try {
      const jsonMatch = raw.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const r = typeof parsed?.rotation === "number"
          ? parsed.rotation
          : parseInt(String(parsed?.rotation ?? ""), 10);
        rotation = [0, 90, 180, 270].includes(r) ? r : null;
        confidence = normalizeConfidence(parsed?.confidence);
        isSOP = parsed?.isSOP === true || String(parsed?.isSOP).toLowerCase() === "true";
      }
    } catch {
      // ignore
    }

    // 2) 純數字備用
    if (rotation === null) {
      const m = raw.match(/(?:^|\b)(0|90|180|270)(?:\b|$)/);
      if (m) {
        rotation = parseInt(m[1], 10);
        confidence = "medium";
      }
    }

    // 3) 舊版中文（相容）
    if (rotation === null) {
      const text = raw.trim().toLowerCase();
      if (text.includes("正向") || text === "正") { rotation = 0; confidence = "medium"; }
      else if (text.includes("倒向") || text.includes("倒置") || text === "倒") { rotation = 180; confidence = "medium"; }
      else if (text.includes("向左") || text === "左") { rotation = 90; confidence = "medium"; }
      else if (text.includes("向右") || text === "右") { rotation = 270; confidence = "medium"; }
    }

    // ★ 額外 SOP 偵測：只檢查「作頁指示書」這個最明確的特徵
    // 注意：不能用 "SOP" 關鍵字，因為 JSON 欄位 "isSOP" 會誤觸發
    if (!isSOP && raw.includes("作頁指示書")) {
      console.log(`[SOP Override] AI said isSOP=false, but found "作頁指示書" in response. Forcing isSOP=true`);
      isSOP = true;
    }

    // ★ 關鍵修正：如果判定為 SOP 但回傳了 90/270，強制修正為 180
    if (isSOP && rotation !== null && (rotation === 90 || rotation === 270)) {
      console.log(`[SOP Correction] AI returned ${rotation}° for SOP document, forcing to 180°`);
      rotation = 180;
    }

    return { rotation, confidence, isSOP };
  };

  // GPT-4o 請求（單次判斷）
  const runOpenAI = async (): Promise<{ rotation: number | null; confidence: OrientationConfidence; raw: string }> => {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: orientationPrompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType || "image/png"};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 64,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const t = await response.text().catch(() => "");
        console.error("OpenAI GPT-4o orientation detection failed:", response.status, t);
        return { rotation: null, confidence: "low", raw: `[error ${response.status}] ${t}` };
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || "";
      const parsed = parseOrientation(String(raw));
      return { rotation: parsed.rotation, confidence: parsed.confidence, raw: String(raw) };
    } catch (error) {
      console.error("OpenAI GPT-4o error:", error);
      return { rotation: null, confidence: "low", raw: String(error) };
    }
  };

  // Gemini 請求（備用）
  const runGemini = async (): Promise<{ rotation: number | null; confidence: OrientationConfidence; raw: string }> => {
    const modelIdGoogle = "gemini-2.5-pro";
    const modelIdGateway = "google/gemini-2.5-pro";

    const requestUrl = useGoogleDirect
      ? `https://generativelanguage.googleapis.com/v1beta/models/${modelIdGoogle}:generateContent?key=${GOOGLE_GEMINI_API_KEY}`
      : "https://ai.gateway.lovable.dev/v1/chat/completions";

    const requestBody = useGoogleDirect
      ? {
          contents: [
            {
              parts: [
                { text: orientationPrompt },
                {
                  inline_data: {
                    mime_type: mimeType || "image/png",
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 64,
          },
        }
      : {
          model: modelIdGateway,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: orientationPrompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType || "image/png"};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          temperature: 0,
          max_tokens: 64,
        };

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (!useGoogleDirect && LOVABLE_API_KEY) {
        headers["Authorization"] = `Bearer ${LOVABLE_API_KEY}`;
      }

      const response = await fetch(requestUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const t = await response.text().catch(() => "");
        console.error("Gemini orientation detection failed:", response.status, t);
        return { rotation: null, confidence: "low", raw: t };
      }

      const data = await response.json();
      const raw = useGoogleDirect
        ? data.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") || ""
        : data.choices?.[0]?.message?.content || "";

      const parsed = parseOrientation(String(raw));
      return { rotation: parsed.rotation, confidence: parsed.confidence, raw: String(raw) };
    } catch (error) {
      console.error("Gemini orientation detection error:", error);
      return { rotation: null, confidence: "low", raw: "" };
    }
  };

  // 主邏輯：GPT-4o 單次判斷
  if (useOpenAI) {
    console.log("Using OpenAI GPT-4o for orientation detection (single pass)");
    const result = await runOpenAI();

    if (result.rotation === null) {
      console.warn("GPT-4o orientation parse failed. Raw:", result.raw?.slice?.(0, 120) ?? "");
      return { rotation: 0, confidence: "low", rawOrientationResponse: `[gpt-4o] ${result.raw}` };
    }

    return {
      rotation: result.rotation,
      confidence: result.confidence,
      rawOrientationResponse: `[gpt-4o] ${result.raw}`,
    };
  }

  // 備用：Gemini Pro 單次判斷
  console.log("Using Google Gemini Pro for orientation detection (single pass)");
  const result = await runGemini();

  if (result.rotation === null) {
    console.warn("Gemini orientation parse failed. Raw:", result.raw?.slice?.(0, 120) ?? "");
    return { rotation: 0, confidence: "low", rawOrientationResponse: `[gemini-pro] ${result.raw}` };
  }

  return {
    rotation: result.rotation,
    confidence: result.confidence,
    rawOrientationResponse: `[gemini-pro] ${result.raw}`,
  };
}

// 在伺服器端旋轉圖片（使用 Canvas API 模擬）
// 注意：Deno 沒有原生 Canvas，所以我們需要在前端做旋轉
// 這個函數會返回旋轉資訊，讓前端處理

// 清理文字輸出
function cleanExtractedText(text: string): string {
  // 偵測模型異常輸出（重複字元 bug）
  const repeatingPattern = /(.)\1{20,}/g;
  const hasAbnormalRepetition = repeatingPattern.test(text);
  
  if (hasAbnormalRepetition) {
    console.warn("偵測到模型異常重複輸出，嘗試清理...");
    text = text.replace(/(.)\1{5,}/g, '$1$1$1');
  }
  
  return text
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/^[\s\-]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 執行單次 OCR 請求
async function performOCR(
  imageBase64: string,
  mimeType: string,
  isRetry: boolean
): Promise<{ text: string; success: boolean }> {
  const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const useGoogleDirect = !!GOOGLE_GEMINI_API_KEY;

  const systemPrompt = getSystemPrompt(isRetry);
  
  const requestUrl = useGoogleDirect
    ? "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=" + GOOGLE_GEMINI_API_KEY
    : "https://ai.gateway.lovable.dev/v1/chat/completions";

  const requestBody = useGoogleDirect
    ? {
        contents: [
          {
            parts: [
              {
                text: systemPrompt + "\n\n請仔細辨識這張圖片中的所有文字內容，特別注意技術規格、型號編號、分數和特殊符號。",
              },
              {
                inline_data: {
                  mime_type: mimeType || "image/png",
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: isRetry ? 0.1 : 0, // 重試時稍微增加溫度
          maxOutputTokens: 8192,
        },
      }
    : {
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: systemPrompt + "\n\n請仔細辨識這張圖片中的所有文字內容，特別注意技術規格、型號編號、分數和特殊符號。",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType || "image/png"};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        temperature: isRetry ? 0.1 : 0,
        max_tokens: 8192,
      };

  const maxAttempts = 3;
  let response: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!useGoogleDirect && LOVABLE_API_KEY) {
      headers["Authorization"] = `Bearer ${LOVABLE_API_KEY}`;
    }

    response = await fetch(requestUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (response.ok) break;

    const errorText = await response.text();
    console.error(`API error (attempt ${attempt}/${maxAttempts}):`, response.status, errorText);

    const status = response.status;
    const retriable = [429, 500, 502, 503, 504].includes(status);

    if (!retriable || attempt === maxAttempts) {
      return { text: "", success: false };
    }

    const base = status === 429 ? 5000 : 800;
    const backoff = status === 429 ? base * attempt : base * Math.pow(2, attempt - 1);
    const jitter = Math.floor(Math.random() * 250);
    await sleep(backoff + jitter);
  }

  if (!response || !response.ok) {
    return { text: "", success: false };
  }

  const data = await response.json();
  
  const extractedText = useGoogleDirect
    ? data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    : data.choices?.[0]?.message?.content || "";

  return { text: cleanExtractedText(extractedText), success: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      imageBase64,
      mimeType,
      skipOrientationDetection,
      detectOrientationOnly,
      documentType, // "sop" | "engineering" | undefined
    } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image data provided" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!GOOGLE_GEMINI_API_KEY && !LOVABLE_API_KEY) {
      console.error("No API key configured");
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const totalStartTime = Date.now();
    console.log("Processing OCR request with Google Gemini 2.5 Pro...");
    console.log("Image MIME type:", mimeType);

    // 僅做方向偵測（不進行 OCR）。用於前端先轉正、再走其他流程（例如 Webhook）。
    if (detectOrientationOnly) {
      console.log("Orientation-only request: Detecting image orientation...");
      const orientationStartTime = Date.now();
      const detected = await detectOrientation(imageBase64, mimeType, documentType);
      const duration = Date.now() - orientationStartTime;

      return new Response(
        JSON.stringify({
          needsRotation: detected.rotation !== 0,
          rotation: detected.rotation,
          confidence: detected.confidence,
          rawOrientationResponse: detected.rawOrientationResponse,
          timing: {
            orientationDuration: duration,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 步驟 1: 方向偵測（可選跳過）
    let orientationResult = { rotation: 0, confidence: "skipped", duration: 0 };
    if (!skipOrientationDetection) {
      console.log("Step 1: Detecting image orientation...");
      const orientationStartTime = Date.now();
      const detected = await detectOrientation(imageBase64, mimeType, documentType);
      orientationResult = {
        ...detected,
        duration: Date.now() - orientationStartTime,
      };
      console.log(`⏱️ 方向偵測耗時: ${orientationResult.duration}ms`);
      console.log(
        `偵測結果: 需旋轉 ${orientationResult.rotation}° (信心度: ${orientationResult.confidence})`
      );

      // 如果需要旋轉，返回旋轉資訊讓前端處理
      if (orientationResult.rotation !== 0 && orientationResult.confidence !== "low") {
        console.log("需要旋轉圖片，返回旋轉資訊給前端處理");
        return new Response(
          JSON.stringify({
            needsRotation: true,
            rotation: orientationResult.rotation,
            confidence: orientationResult.confidence,
            timing: {
              orientationDuration: orientationResult.duration,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 步驟 2: OCR 辨識（圖片已經是正向的）
    console.log("Step 2: Performing OCR recognition...");

    // 最多嘗試 3 次的 OCR 重試邏輯
    const MAX_OCR_ATTEMPTS = 3;
    const MIN_EXPECTED_CHARS = 50; // 最少需要 50 個非空白字元才算成功
    
    let result = { text: "", success: false };
    let bestResult = { text: "", nonWhitespace: 0 };
    let finalAttemptCount = 1;
    let totalOcrDuration = 0;
    
    for (let ocrAttempt = 1; ocrAttempt <= MAX_OCR_ATTEMPTS; ocrAttempt++) {
      const isRetry = ocrAttempt > 1;
      finalAttemptCount = ocrAttempt;
      
      console.log(`OCR attempt ${ocrAttempt}/${MAX_OCR_ATTEMPTS}...`);
      
      if (isRetry) {
        // 重試前等待，逐次增加等待時間
        const waitTime = 1000 * ocrAttempt;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await sleep(waitTime);
      }
      
      const ocrStartTime = Date.now();
      result = await performOCR(imageBase64, mimeType, isRetry);
      const ocrDuration = Date.now() - ocrStartTime;
      totalOcrDuration += ocrDuration;
      const nonWhitespaceLength = result.text.replace(/\s/g, '').length;
      
      console.log(`⏱️ AI 辨識耗時: ${ocrDuration}ms`);
      console.log(`Attempt ${ocrAttempt} - text length: ${result.text.length}, non-whitespace: ${nonWhitespaceLength}`);
      
      // 記錄最佳結果
      if (nonWhitespaceLength > bestResult.nonWhitespace) {
        bestResult = { text: result.text, nonWhitespace: nonWhitespaceLength };
        console.log(`New best result: ${nonWhitespaceLength} chars`);
      }
      
      // 如果結果足夠長，就停止重試
      if (result.success && nonWhitespaceLength >= MIN_EXPECTED_CHARS) {
        console.log(`Got sufficient result (${nonWhitespaceLength} chars), stopping retries`);
        break;
      }
      
      // 如果這是最後一次嘗試，使用最佳結果
      if (ocrAttempt === MAX_OCR_ATTEMPTS) {
        console.log(`Max attempts reached, using best result: ${bestResult.nonWhitespace} chars`);
        result.text = bestResult.text;
      }
    }

    const finalNonWhitespace = result.text.replace(/\s/g, '').length;
    const totalDuration = Date.now() - totalStartTime;
    console.log(`⏱️ 總處理時間: ${totalDuration}ms`);
    console.log("OCR completed - final text length:", result.text.length, "non-whitespace:", finalNonWhitespace);

    // 判斷是否為空結果（真正的失敗）
    const isEmpty = finalNonWhitespace < 5;
    
    if (isEmpty) {
      console.error("OCR 失敗：無法辨識任何文字");
      return new Response(
        JSON.stringify({
          text: "",
          confidence: 0,
          error: "無法辨識圖片中的文字，請確認圖片清晰度或嘗試重新上傳",
          isEmpty: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (finalNonWhitespace < MIN_EXPECTED_CHARS) {
      console.warn(`警告：辨識結果文字較短 (${finalNonWhitespace} chars)，可能有部分遺漏`);
    }

    return new Response(
      JSON.stringify({
        text: result.text,
        confidence: result.success ? 95 : 50,
        isEmpty: false,
        needsRotation: false,
        timing: {
          orientationDuration: orientationResult.duration,
          ocrDuration: totalOcrDuration,
          totalDuration,
          attemptCount: finalAttemptCount,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("OCR processing error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "處理過程中發生錯誤",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
