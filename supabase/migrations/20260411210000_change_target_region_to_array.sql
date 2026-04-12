alter table public.core_projects
alter column target_region drop default;

alter table public.core_projects
alter column target_region type text[]
using case
  when target_region is null or btrim(target_region) = '' then array['Worldwide']::text[]
  else array[target_region]::text[]
end;

update public.core_projects
set target_region = array['Worldwide']::text[]
where target_region is null
   or array_length(target_region, 1) is null;

alter table public.core_projects
alter column target_region set default array['Worldwide']::text[];
