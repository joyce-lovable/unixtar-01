-- 1. 建立模具群組表
CREATE TABLE public.mold_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id serial NOT NULL UNIQUE,
    part_name text NOT NULL UNIQUE,
    downloaded boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. 建立 SOP 群組表
CREATE TABLE public.sop_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id serial NOT NULL UNIQUE,
    part_number text NOT NULL UNIQUE,
    downloaded boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. 為 mold_ocr_results 新增 group_id 欄位
ALTER TABLE public.mold_ocr_results 
ADD COLUMN group_id integer REFERENCES public.mold_groups(group_id);

-- 4. 為 sop_ocr_results 新增 group_id 欄位
ALTER TABLE public.sop_ocr_results 
ADD COLUMN group_id integer REFERENCES public.sop_groups(group_id);

-- 5. 啟用 RLS
ALTER TABLE public.mold_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_groups ENABLE ROW LEVEL SECURITY;

-- 6. 為 mold_groups 建立 RLS 政策
CREATE POLICY "Allow public select" ON public.mold_groups FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.mold_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.mold_groups FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.mold_groups FOR DELETE USING (true);

-- 7. 為 sop_groups 建立 RLS 政策
CREATE POLICY "Allow public select" ON public.sop_groups FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.sop_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.sop_groups FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.sop_groups FOR DELETE USING (true);

-- 8. 為既有的模具資料建立群組並填充 group_id
INSERT INTO public.mold_groups (part_name)
SELECT DISTINCT part_name FROM public.mold_ocr_results
WHERE part_name IS NOT NULL AND part_name != ''
ON CONFLICT (part_name) DO NOTHING;

UPDATE public.mold_ocr_results mr
SET group_id = mg.group_id
FROM public.mold_groups mg
WHERE mr.part_name = mg.part_name;

-- 9. 為既有的 SOP 資料建立群組並填充 group_id
INSERT INTO public.sop_groups (part_number)
SELECT DISTINCT part_number FROM public.sop_ocr_results
WHERE part_number IS NOT NULL AND part_number != ''
ON CONFLICT (part_number) DO NOTHING;

UPDATE public.sop_ocr_results sr
SET group_id = sg.group_id
FROM public.sop_groups sg
WHERE sr.part_number = sg.part_number;