-- 建立工程圖轉模具編號資料表
CREATE TABLE public.mold_ocr_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  seq_number integer NOT NULL,
  file_name text NOT NULL,
  part_name text NOT NULL,
  mold_number text NOT NULL
);

-- 建立索引
CREATE INDEX idx_mold_ocr_created_at ON public.mold_ocr_results(created_at DESC);
CREATE INDEX idx_mold_ocr_mold_number ON public.mold_ocr_results(mold_number);

-- 啟用 RLS（暫時開放公開存取）
ALTER TABLE public.mold_ocr_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert" ON public.mold_ocr_results 
FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select" ON public.mold_ocr_results 
FOR SELECT USING (true);