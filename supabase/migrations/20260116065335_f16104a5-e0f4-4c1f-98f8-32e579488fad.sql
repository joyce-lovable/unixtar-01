-- Create mbom_groups table for tracking group IDs and download status
CREATE TABLE public.mbom_groups (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id SERIAL NOT NULL UNIQUE,
    customer_part_name TEXT NOT NULL UNIQUE,
    downloaded BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.mbom_groups ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public access
CREATE POLICY "Allow public select" 
ON public.mbom_groups 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert" 
ON public.mbom_groups 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update" 
ON public.mbom_groups 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public delete" 
ON public.mbom_groups 
FOR DELETE 
USING (true);

-- Add group_id column to mbom_results
ALTER TABLE public.mbom_results 
ADD COLUMN group_id INTEGER REFERENCES public.mbom_groups(group_id);

-- Migrate existing data: create group entries for existing customer_part_names
INSERT INTO public.mbom_groups (customer_part_name)
SELECT DISTINCT customer_part_name 
FROM public.mbom_results
WHERE customer_part_name IS NOT NULL
ON CONFLICT (customer_part_name) DO NOTHING;

-- Update existing mbom_results with their group_ids
UPDATE public.mbom_results 
SET group_id = mbom_groups.group_id
FROM public.mbom_groups
WHERE mbom_results.customer_part_name = mbom_groups.customer_part_name;