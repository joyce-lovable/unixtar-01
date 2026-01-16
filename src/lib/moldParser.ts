/**
 * 成型模具編號解析器
 * 偵測 OCR 結果中的成型模具編號、品名、PART NUMBER，並展開分數符號為完整列表
 */

export interface MoldEntry {
  original: string;
  expanded: string[];
}

export interface ParsedData {
  molds: MoldEntry[];
  partName: string | null;
  partNumber: string | null;
  hasResults: boolean;
}

/**
 * 將包含分數的模具編號展開為完整列表
 * 例如: M½-D15-A0x -> M1-D15-A0x, M2-D15-A0x
 */
export function expandMoldNumber(moldNumber: string): string[] {
  // 標準化分數符號的各種表示方式（包含上標/下標組合）
  // ¹/₂ = 上標1 + 斜線 + 下標2
  const fractionPatterns = [
    { pattern: /½|1\/2|⁄2|¹\/₂|¹⁄₂/g, values: ['1', '2'] },
    { pattern: /⅓|1\/3|¹\/₃|¹⁄₃/g, values: ['1', '2', '3'] },
    { pattern: /¼|1\/4|¹\/₄|¹⁄₄/g, values: ['1', '2', '3', '4'] },
    { pattern: /⅕|1\/5|¹\/₅|¹⁄₅/g, values: ['1', '2', '3', '4', '5'] },
    { pattern: /⅙|1\/6|¹\/₆|¹⁄₆/g, values: ['1', '2', '3', '4', '5', '6'] },
    { pattern: /⅛|1\/8|¹\/₈|¹⁄₈/g, values: ['1', '2', '3', '4', '5', '6', '7', '8'] },
  ];

  // 檢查是否包含分數
  for (const { pattern, values } of fractionPatterns) {
    if (pattern.test(moldNumber)) {
      return values.map(v => moldNumber.replace(pattern, v));
    }
  }

  // ====== OCR 誤讀修正 ======
  // 常見情況：M½ 被誤讀成 M12 或 M121 或其他變體
  // 規則：M 後面緊接著 12 開頭的任意數字 (½ 誤讀)，後面接 - 
  // 例如: M121-BAR-JVO× → 應該是 M½-BAR-JVO× → 展開為 M1-BAR-JVO×, M2-BAR-JVO×
  // 重點：整個 "12..." 數字部分都是誤讀，應該完整替換掉
  
  const ocrMisreadPatterns = [
    // M12 開頭的任意數字被誤讀 (½ → 12, 121, 122, etc.)
    { pattern: /^M12\d*(-)/i, values: ['1', '2'] },
    // M13 開頭的任意數字被誤讀 (⅓ → 13, 131, etc.)
    { pattern: /^M13\d*(-)/i, values: ['1', '2', '3'] },
    // M14 開頭的任意數字被誤讀 (¼ → 14, 141, etc.)
    { pattern: /^M14\d*(-)/i, values: ['1', '2', '3', '4'] },
  ];

  for (const { pattern, values } of ocrMisreadPatterns) {
    const match = moldNumber.match(pattern);
    if (match) {
      // match[0] = 完整匹配 (如 "M121-")
      // match[1] = 分隔符 "-"
      const suffix = moldNumber.slice(match[0].length);
      return values.map(v => `M${v}-${suffix}`);
    }
  }

  // 處理可能被 OCR 誤判的情況 (如 M- 可能是 M½)
  // 檢查 M 後面是否接著 - 且沒有數字
  const misreadPattern = /^M-(?=[A-Z])/;
  if (misreadPattern.test(moldNumber)) {
    return ['1', '2'].map(v => moldNumber.replace(misreadPattern, `M${v}-`));
  }

  // 沒有分數，返回原始值
  return [moldNumber];
}

/**
 * 從檔名提取 PART NUMBER
 * 例如: CA461-70160-C=E.png -> CA461-70160
 */
export function extractPartNumberFromFilename(filename: string): string | null {
  // 移除副檔名
  let name = filename.replace(/\.(png|jpg|jpeg|pdf|gif|bmp|tiff?)$/i, '');

  // 移除 = 後面的所有內容（如 =D、=E、=D 單頁 等版本標記）
  name = name.replace(/=.*$/, '');

  // 移除結尾的 -UN (不區分大小寫)
  name = name.replace(/-UN$/i, '');

  // 移除檔名常見的尾碼（REV/版本資訊）
  name = name.replace(/[-_]?REV.*$/i, '');

  name = name.trim();
  if (!name) return null;

  name = name.toUpperCase();

  // 檔名因不能含「/」常以「-」代替：
  // 若有 2 個以上「-」，保留第一個「-」，其餘「-」轉回「/」
  const hyphenCount = (name.match(/-/g) ?? []).length;
  if (!name.includes('/') && hyphenCount >= 2) {
    const firstHyphenIndex = name.indexOf('-');
    name =
      name.slice(0, firstHyphenIndex + 1) +
      name.slice(firstHyphenIndex + 1).replace(/-/g, '/');
  }

  // 基本驗證：須包含數字，且長度至少 3 字元
  // 不再強制要求分隔符，以支援像 EL00335 這類沒有分隔符的料號
  if (!/[0-9]/.test(name) || name.length < 3) return null;

  return name;
}

/**
 * 從檔名提取品名 (完整檔名去掉副檔名，並移除結尾的 -UN)
 */
export function extractPartNameFromFilename(filename: string): string | null {
  // 移除副檔名
  let name = filename.replace(/\.(png|jpg|jpeg|pdf|gif|bmp|tiff?)$/i, '');
  
  // 移除 = 後面的所有內容（如 =D、=E、=D 單頁 等版本標記）
  name = name.replace(/=.*$/, '');
  
  // 移除結尾的 -UN (不區分大小寫)
  name = name.replace(/-UN$/i, '');
  
  // 移除前後空白
  name = name.trim();
  
  return name || null;
}

/**
 * 驗證是否為獨立的成型模具編號（不需要「成型模具」標籤）
 * 編碼原則: MX-XXXXX-XX0x
 * - M開頭2碼: M1, M2, MS, MP
 * - 中間碼數3-5碼: 插頭物件代號或客戶代碼
 * - 最後3-4碼: 前1-2碼英數+最後2碼可能0x結尾，或直接數字3碼
 */
export function isValidStandaloneMoldNumber(text: string): boolean {
  // 清理文字
  const cleaned = text.trim().toUpperCase();
  
  // 必須以 M 開頭
  if (!cleaned.startsWith('M')) return false;
  
  // 必須包含至少2個連字號
  const hyphenCount = (cleaned.match(/-/g) ?? []).length;
  if (hyphenCount < 2) return false;
  
  // 分解結構: M開頭碼-中間碼-結尾碼
  const parts = cleaned.split('-');
  if (parts.length < 3) return false;
  
  const prefix = parts[0]; // M1, M2, MS, MP, M½ 等
  const middle = parts.slice(1, -1).join('-'); // 中間碼（可能有多段）
  const suffix = parts[parts.length - 1]; // 結尾碼
  
  // 驗證 M 開頭碼 (M + 1個字元: 數字、S、P、分數等)
  // 支援: M1, M2, MS, MP, M½ 等
  const validPrefixPattern = /^M[0-9½⅓¼⅕⅙⅛A-Z]$/;
  if (!validPrefixPattern.test(prefix)) return false;
  
  // 驗證中間碼: 3-5碼 (移除連字號後計算)
  const middleClean = middle.replace(/-/g, '');
  if (middleClean.length < 3 || middleClean.length > 8) return false;
  
  // 驗證結尾碼: 2-4碼，可能是 XX0x 或純數字
  // 例如: A0x, B01, 001, HN0x, 等
  if (suffix.length < 2 || suffix.length > 4) return false;
  
  // 結尾碼格式驗證:
  // 1. 最後以小寫 x 結尾: XX0x
  // 2. 最後是數字: XXX 或 XXXX
  const suffixLower = parts[parts.length - 1].toLowerCase();
  const validSuffixPattern = /^[a-z0-9]{1,3}(0x|[0-9])$/i;
  if (!validSuffixPattern.test(suffixLower)) {
    // 也接受純英數結尾 (如 A01, HN01)
    if (!/^[A-Z0-9]{2,4}$/i.test(suffix)) return false;
  }
  
  // 整體長度驗證: 移除連字號後至少 8 碼
  const totalLength = cleaned.replace(/-/g, '').length;
  if (totalLength < 8) return false;
  
  return true;
}

/**
 * 從 OCR 文字中提取所有可能的獨立成型模具編號
 * 掃描整份文件，找出符合編碼原則的型號
 */
export function extractStandaloneMoldNumbers(ocrText: string): string[] {
  const results: string[] = [];
  
  // 模式: M開頭，後接連字號分隔的編碼
  // M[0-9A-Z½⅓¼]-XXX-XXX 格式
  const moldPattern = /M[0-9½⅓¼⅕⅙⅛A-Z]-[A-Z0-9]+-[A-Z0-9x]+/gi;
  
  const matches = ocrText.match(moldPattern) || [];
  
  for (const match of matches) {
    // 清理結尾標點
    let cleaned = match.replace(/[.,，。]+$/, '').trim();
    
    // 驗證是否符合完整編碼原則
    if (isValidStandaloneMoldNumber(cleaned)) {
      // 標準化: 結尾 x 小寫
      cleaned = cleaned.replace(/X$/, 'x');
      
      if (!results.includes(cleaned.toUpperCase())) {
        results.push(cleaned.toUpperCase());
      }
    }
  }
  
  return results;
}

/**
 * 從 OCR 文字中解析成型模具、品名、PART NUMBER
 * 規則：
 * 1) PART NUMBER 以「檔名」為主（因 OCR 位置可能偏移抓到 REV 等雜訊）
 * 2) 若 OCR 有抓到且與檔名一致（把 / 視為 - 後可對上），則採用 OCR 的版本（保留 /）
 * 3) 品名 = PART NUMBER（並移除尾碼 -UN）
 * 4) 同時搜尋「成型模具:」標籤後的編號，以及獨立的模具編號（符合編碼原則）
 * @param ocrText OCR 辨識的文字
 * @param filename 可選的檔名，用於提取 PART NUMBER
 */
export function parseMoldEntries(ocrText: string, filename?: string): ParsedData {
  const molds: MoldEntry[] = [];
  const foundMoldNumbers = new Set<string>(); // 追蹤已找到的型號，避免重複

  // ====== OCR 誤讀修正（在解析前先修正常見錯誤）======
  let correctedText = ocrText
    // 成型鐵具 -> 成型模具（常見誤讀：模 → 鐵）
    .replace(/成型鐵具/g, '成型模具')
    // 成型横具 -> 成型模具
    .replace(/成型横具/g, '成型模具')
    // 成型摸具 -> 成型模具
    .replace(/成型摸具/g, '成型模具')
    // 成型棋具 -> 成型模具
    .replace(/成型棋具/g, '成型模具');

  const lines = correctedText.split('\n');

  // 匹配模式
  const moldPattern = /成型模具[：:]\s*(.+)/;

  // OCR 的 PART NUMBER：必須包含至少一個分隔符（- 或 /），避免抓到 REV
  const ocrPartNumberPattern =
    /(?:PART\s*NUMBER|P\/N|料號)[：:\s]+([A-Z0-9]+(?:[-/][A-Z0-9]+)+)/i;

  // 檔名優先
  const filenamePartNumber = filename ? extractPartNumberFromFilename(filename) : null;

  // OCR 作為輔助（只在「可驗證」時採用）
  let ocrPartNumber: string | null = null;

  // ====== 第一階段：解析「成型模具:」標籤後的編號 ======
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 解析成型模具
    const moldMatch = line.match(moldPattern);
    if (moldMatch) {
      let moldValueRaw = moldMatch[1].trim();

      // 處理換行情況：若結尾是逗號，繼續讀取後續行
      while (moldValueRaw.endsWith(',') || moldValueRaw.endsWith('，')) {
        const nextLineIndex = i + 1;
        if (nextLineIndex < lines.length) {
          const nextLine = lines[nextLineIndex].trim();
          // 檢查下一行是否以 M 開頭（模具編號格式）
          if (/^M[0-9½⅓¼⅕⅙⅛⅑A-Z]?-/i.test(nextLine) || /^M\s*-/i.test(nextLine)) {
            moldValueRaw += nextLine;
            i++; // 跳過已處理的行
          } else {
            break;
          }
        } else {
          break;
        }
      }

      // 以逗號分隔，解析所有模具編號
      const moldParts = moldValueRaw.split(/[,，]/).map(s => s.trim()).filter(Boolean);

      for (let moldValue of moldParts) {
        // 移除 M 後可能的空格（OCR 誤讀）
        moldValue = moldValue.replace(/^M\s+/, 'M');
        // 移除結尾的標點符號（. 或 ,）
        moldValue = moldValue.replace(/[.,]+$/, '');
        
        // 驗證是否為有效模具編號格式：必須以 M 開頭，後接連字號
        // 支援格式: M1-xxx, M2-xxx, M½-xxx, MS-xxx, M-BAR-xxx
        const isValidMold = /^M[0-9½⅓¼⅕⅙⅛⅑A-Z]?-/i.test(moldValue) || 
                           /^M[0-9]+\/[0-9]+-/i.test(moldValue) ||  // M1/2-xxx 格式
                           /^M[¹²³⁴⁵⁶⁷⁸⁹⁰\/₁₂₃₄₅₆₇₈₉₀]+-/i.test(moldValue); // 上下標分數格式
        
        if (!isValidMold) continue;

        const expanded = expandMoldNumber(moldValue);

        // 過濾展開後的結果：移除長度少於 5 碼的無效模具編號
        const validExpanded = expanded.filter(m => m.length >= 5);
        
        if (validExpanded.length === 0) continue;

        // 標準化結尾 x 為小寫
        const normalizedExpanded = validExpanded.map(m => m.replace(/X$/, 'x'));

        // 避免重複
        const normalizedOriginal = moldValue.replace(/X$/, 'x');
        if (!foundMoldNumbers.has(normalizedOriginal.toUpperCase())) {
          foundMoldNumbers.add(normalizedOriginal.toUpperCase());
          for (const exp of normalizedExpanded) {
            foundMoldNumbers.add(exp.toUpperCase());
          }
          molds.push({
            original: normalizedOriginal,
            expanded: normalizedExpanded,
          });
        }
      }
    }

    // OCR 解析 PART NUMBER（僅先暫存，最後再決定要不要採用）
    if (!ocrPartNumber) {
      const m = line.match(ocrPartNumberPattern);
      if (m) {
        let pn = m[1].trim().toUpperCase();
        pn = pn.replace(/-UN$/i, '');
        ocrPartNumber = pn;
      }
    }
  }

  // ====== 第二階段：掃描獨立的模具編號（不需要「成型模具」標籤）======
  const standaloneMolds = extractStandaloneMoldNumbers(correctedText);
  
  for (const moldNumber of standaloneMolds) {
    // 檢查是否已在第一階段找到
    if (foundMoldNumbers.has(moldNumber.toUpperCase())) continue;
    
    const expanded = expandMoldNumber(moldNumber);
    const validExpanded = expanded.filter(m => m.length >= 5);
    
    if (validExpanded.length === 0) continue;
    
    // 標準化結尾 x 為小寫
    const normalizedExpanded = validExpanded.map(m => m.replace(/X$/, 'x'));
    const normalizedOriginal = moldNumber.replace(/X$/, 'x');
    
    foundMoldNumbers.add(normalizedOriginal.toUpperCase());
    for (const exp of normalizedExpanded) {
      foundMoldNumbers.add(exp.toUpperCase());
    }
    
    molds.push({
      original: normalizedOriginal,
      expanded: normalizedExpanded,
    });
  }

  // 決策：以檔名為主；只有當 OCR 與檔名可對上時才採用 OCR（保留 /）
  let partNumber: string | null = filenamePartNumber ?? null;
  if (ocrPartNumber) {
    if (!filenamePartNumber) {
      partNumber = ocrPartNumber;
    } else {
      const ocrComparable = ocrPartNumber.replace(/\//g, '-');
      const fileComparable = filenamePartNumber.replace(/\//g, '-');
      if (ocrComparable === fileComparable) {
        partNumber = ocrPartNumber;
      }
    }
  }

  if (partNumber) {
    partNumber = partNumber.replace(/-UN$/i, '');
  }

  const partName = partNumber ? partNumber : null;

  return {
    molds,
    partName,
    partNumber,
    hasResults: molds.length > 0 || partName !== null || partNumber !== null,
  };
}

/**
 * 格式化成型模具結果為顯示文字
 */
export function formatMoldResults(parsed: ParsedData): string {
  if (!parsed.hasResults) {
    return '';
  }

  const lines: string[] = [];
  
  if (parsed.partName) {
    lines.push(`品名: ${parsed.partName}`);
  }
  
  if (parsed.partNumber) {
    lines.push(`PART NUMBER: ${parsed.partNumber}`);
  }
  
  if (parsed.molds.length > 0) {
    lines.push('');
    lines.push('成型模具清單:');
    for (const entry of parsed.molds) {
      for (const exp of entry.expanded) {
        lines.push(`  • ${exp}`);
      }
    }
  }

  return lines.join('\n');
}
