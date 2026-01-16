// 解析每日檢核資料的工具函式

export interface ParsedRow {
  date1: string;      // 第一個日期
  date2: string;      // 第二個日期
  code1: string;      // 第一個編號 (如 EFK-R100741)
  code2: string;      // 第二個編號 (如 ABAR-10846)
  field1: string;     // G0 後的欄位
  value1: string;     // 數值
  code3: string;      // 第三個編號 (如 U2603EG1-Q8002)
  value2: string;     // 最後的數值
  date3: string;      // 最後的日期
  raw: string;        // 原始資料
}

// 解析單行資料
export function parseLineV1(line: string): ParsedRow | null {
  if (!line.trim()) return null;

  // 移除多餘空白
  const cleaned = line.trim();

  // 嘗試匹配格式: 日期+日期+編號+編號+G0+數值+編號+數值+日期
  // 例如: 26/01/1426/01/15EFK-R100741ABAR-10846G025.0U2603EG1-Q8002526/01/15

  // 日期格式: YY/MM/DD (8字元)
  const datePattern = /(\d{2}\/\d{2}\/\d{2})/g;
  const dates = cleaned.match(datePattern) || [];

  // 提取編號模式 (包含字母和數字的組合)
  // 格式1: XXX-RXXXXX (如 EFK-R100741, EG1-R10138)
  // 格式2: XXXX-XXXXX (如 ABAR-10846)
  // 格式3: UXXXXXX-XXXXX (如 U2603EG1-Q8002)

  try {
    // 移除所有日期，剩下的進行解析
    let remaining = cleaned;
    const extractedDates: string[] = [];
    
    // 提取前兩個日期
    for (let i = 0; i < 2 && dates.length > i; i++) {
      const idx = remaining.indexOf(dates[i]);
      if (idx !== -1) {
        extractedDates.push(dates[i]);
        remaining = remaining.slice(0, idx) + remaining.slice(idx + 8);
      }
    }

    // 提取最後一個日期
    if (dates.length > 2) {
      const lastDate = dates[dates.length - 1];
      const lastIdx = remaining.lastIndexOf(lastDate);
      if (lastIdx !== -1) {
        extractedDates.push(lastDate);
        remaining = remaining.slice(0, lastIdx) + remaining.slice(lastIdx + 8);
      }
    }

    // 現在 remaining 應該是: EFK-R100741ABAR-10846G025.0U2603EG1-Q800252
    // 嘗試用 G0 或 G 作為分隔點
    const g0Match = remaining.match(/^(.+?)(G\d*)(.+)$/);
    
    if (g0Match) {
      const beforeG = g0Match[1];
      const gPart = g0Match[2];
      const afterG = g0Match[3];

      // beforeG 應該包含兩個編號: EFK-R100741ABAR-10846
      // 尋找第二個 - 開始的位置
      const dashMatches = [...beforeG.matchAll(/-/g)];
      let code1 = '';
      let code2 = '';
      
      if (dashMatches.length >= 2) {
        // 找到第一個編號的結尾（第二個編號的開始）
        // 通常第二個編號開頭是 A-Z
        const pattern = /^([A-Z0-9]+-[A-Z0-9]+)([A-Z][A-Z0-9]+-[A-Z0-9]+)$/;
        const codeMatch = beforeG.match(pattern);
        if (codeMatch) {
          code1 = codeMatch[1];
          code2 = codeMatch[2];
        } else {
          // 嘗試其他分割方式
          const firstDashIdx = beforeG.indexOf('-');
          if (firstDashIdx !== -1) {
            // 找第一個編號結尾（數字結束，字母開始）
            let splitIdx = -1;
            for (let i = firstDashIdx + 1; i < beforeG.length; i++) {
              if (/[A-Z]/.test(beforeG[i]) && /\d/.test(beforeG[i-1])) {
                splitIdx = i;
                break;
              }
            }
            if (splitIdx !== -1) {
              code1 = beforeG.slice(0, splitIdx);
              code2 = beforeG.slice(splitIdx);
            }
          }
        }
      }

      // afterG 應該包含: 25.0U2603EG1-Q800252
      // 分割數值和後面的編號
      const afterGMatch = afterG.match(/^([\d.]+)(.*)$/);
      let value1 = '';
      let restPart = afterG;
      
      if (afterGMatch) {
        value1 = afterGMatch[1];
        restPart = afterGMatch[2];
      }

      // restPart: U2603EG1-Q800252
      // 最後的數字是 value2
      const lastNumMatch = restPart.match(/^(.+?)(\d+)$/);
      let code3 = restPart;
      let value2 = '';
      
      if (lastNumMatch) {
        code3 = lastNumMatch[1];
        value2 = lastNumMatch[2];
      }

      return {
        date1: extractedDates[0] || '',
        date2: extractedDates[1] || '',
        code1,
        code2,
        field1: gPart,
        value1,
        code3,
        value2,
        date3: extractedDates[2] || '',
        raw: line,
      };
    }
  } catch (e) {
    console.error('Parse error:', e);
  }

  return null;
}

// 使用分隔符解析（逗號、空格、點、特定模式）
export function parseLineWithDelimiters(line: string): string[] {
  if (!line.trim()) return [];

  // 先用常見分隔符分割
  // 但要保留日期格式 (XX/XX/XX) 和小數點
  
  let result: string[] = [];
  let current = '';
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    // 檢查是否是日期格式的開始 (數字/數字/數字)
    if (/\d/.test(char)) {
      // 可能是日期或數字
      let temp = '';
      let j = i;
      
      // 收集連續的數字、/、.
      while (j < line.length && /[\d\/.]/.test(line[j])) {
        temp += line[j];
        j++;
      }
      
      // 判斷是否是日期格式
      if (/^\d{2}\/\d{2}\/\d{2}$/.test(temp)) {
        if (current) result.push(current);
        current = '';
        result.push(temp);
        i = j;
        continue;
      }
      
      // 判斷是否是數字（可能有小數點）
      if (/^\d+\.?\d*$/.test(temp)) {
        if (current) result.push(current);
        current = '';
        result.push(temp);
        i = j;
        continue;
      }
      
      // 否則逐字處理
      current += char;
      i++;
      continue;
    }
    
    // 分隔符
    if (char === ',' || char === ' ' || char === '\t') {
      if (current) {
        result.push(current);
        current = '';
      }
      i++;
      continue;
    }
    
    // 一般字元
    current += char;
    i++;
  }
  
  if (current) result.push(current);
  
  return result.filter(s => s.trim());
}

// 智能解析：根據資料特徵自動分欄
export function smartParseLine(line: string): string[] {
  if (!line.trim()) return [];
  
  const result: string[] = [];
  let remaining = line.trim();
  
  // 日期模式: YY/MM/DD
  const dateRegex = /^(\d{2}\/\d{2}\/\d{2})/;
  
  // 編號模式: XXX-XXXXX 或 ABAR-XXXXX 等
  const codeRegex = /^([A-Z]{2,4}-[A-Z]?\d{5,6})/;
  const codeRegex2 = /^([A-Z]+\d*-[A-Z0-9]+)/;
  
  // 數字模式（包含小數）
  const numberRegex = /^(\d+\.?\d*)/;
  
  // USD 金額模式
  const usdRegex = /^(USD[\d.]+)/;
  
  // G0 或 GF 等標記
  const gRegex = /^(G[F0-9]*)/;
  
  // GHK 標記
  const ghkRegex = /^(GHK)/;
  
  while (remaining.length > 0) {
    let matched = false;
    
    // 嘗試匹配日期
    let match = remaining.match(dateRegex);
    if (match) {
      result.push(match[1]);
      remaining = remaining.slice(match[1].length);
      matched = true;
      continue;
    }
    
    // 嘗試匹配 USD 金額
    match = remaining.match(usdRegex);
    if (match) {
      result.push(match[1]);
      remaining = remaining.slice(match[1].length);
      matched = true;
      continue;
    }
    
    // 嘗試匹配 GHK
    match = remaining.match(ghkRegex);
    if (match) {
      result.push(match[1]);
      remaining = remaining.slice(match[1].length);
      matched = true;
      continue;
    }
    
    // 嘗試匹配 G 標記
    match = remaining.match(gRegex);
    if (match) {
      result.push(match[1]);
      remaining = remaining.slice(match[1].length);
      matched = true;
      continue;
    }
    
    // 嘗試匹配編號
    match = remaining.match(codeRegex);
    if (match) {
      result.push(match[1]);
      remaining = remaining.slice(match[1].length);
      matched = true;
      continue;
    }
    
    match = remaining.match(codeRegex2);
    if (match) {
      result.push(match[1]);
      remaining = remaining.slice(match[1].length);
      matched = true;
      continue;
    }
    
    // 嘗試匹配數字
    match = remaining.match(numberRegex);
    if (match) {
      result.push(match[1]);
      remaining = remaining.slice(match[1].length);
      matched = true;
      continue;
    }
    
    // 無法匹配，取一個字元
    if (!matched) {
      // 如果是分隔符，跳過
      if (/[\s,.]/.test(remaining[0])) {
        remaining = remaining.slice(1);
      } else {
        // 收集到下一個可識別的分隔點
        let nextBreak = 1;
        for (let i = 1; i < remaining.length; i++) {
          if (/[\s,.]/.test(remaining[i]) || /\d{2}\//.test(remaining.slice(i))) {
            nextBreak = i;
            break;
          }
          nextBreak = i + 1;
        }
        result.push(remaining.slice(0, nextBreak));
        remaining = remaining.slice(nextBreak);
      }
    }
  }
  
  // 過濾掉空白值，確保欄位往左靠
  return result.filter(s => s && s.trim() !== '');
}

// 將解析結果轉為 Excel 格式的二維陣列
// 支援空白字元 + 特殊分隔符（例如 \x01/\u0001）作為欄位分隔
export function parseFileContent(content: string): string[][] {
  const lines = content.split('\n').filter((line) => line.trim());

  return lines.map((line) => {
    // 有些來源（例如複製/匯出）會用 \u0001 (SOH) 當欄位分隔符
    const normalized = line.replace(/\u00A0/g, ' ');

    return normalized
      .trim()
      .split(/[\s\u0001]+/)
      .filter((cell) => cell.trim() !== '');
  });
}
