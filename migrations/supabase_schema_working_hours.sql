-- Working Hours Support
-- Add working hours configuration to user_settings

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS work_hours_start text DEFAULT '09:00', -- "HH:MM" 24h format
ADD COLUMN IF NOT EXISTS work_hours_end text DEFAULT '17:00',   -- "HH:MM" 24h format
ADD COLUMN IF NOT EXISTS work_days integer[] DEFAULT '{1,2,3,4,5}'; -- 0=Sun, 1=Mon...

COMMENT ON COLUMN public.user_settings.work_hours_start IS 'Start of working day (HH:MM)';
COMMENT ON COLUMN public.user_settings.work_hours_end IS 'End of working day (HH:MM)';
COMMENT ON COLUMN public.user_settings.work_days IS 'Array of days (0-6) considered working days';
