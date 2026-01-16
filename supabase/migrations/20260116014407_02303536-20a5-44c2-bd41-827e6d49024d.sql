-- 暫時允許公開插入（因為目前沒有使用者認證）
-- 未來加入認證後可以修改為更嚴格的政策
ALTER TABLE public.sop_ocr_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert" 
ON public.sop_ocr_results 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public select" 
ON public.sop_ocr_results 
FOR SELECT 
USING (true);