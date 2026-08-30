-- Migration: Admin AI Configuration and Audit Logging
-- Description: Creates tables for secure global AI provider configuration and audit trail

-- Enable pgcrypto for encryption if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table for Admin AI Configuration
CREATE TABLE IF NOT EXISTS public.admin_ai_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    base_url TEXT,
    api_version TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id),
    CONSTRAINT single_admin_config CHECK (id IS NOT NULL)
);

-- Ensure only one active global configuration row exists
CREATE UNIQUE INDEX IF NOT EXISTS admin_ai_config_singleton ON public.admin_ai_config ((true));

-- Table for Admin Configuration Audit Logging
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    user_email TEXT NOT NULL,
    action TEXT NOT NULL, -- 'CONFIG_CREATED', 'CONFIG_UPDATED', 'CONFIG_ENABLED', 'CONFIG_DISABLED', 'CONFIG_DELETED', 'CONNECTION_TESTED'
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying audit log
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_user ON public.admin_audit_log (user_id);

-- Enable RLS on both tables
ALTER TABLE public.admin_ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (auth.jwt() ->> 'email') = 'pardhan9013334137@gmail.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for admin_ai_config
-- Only the designated admin can read the configuration (and only through secure views/functions)
CREATE POLICY "Admin can view admin_ai_config"
    ON public.admin_ai_config
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Only the designated admin can insert configuration
CREATE POLICY "Admin can insert admin_ai_config"
    ON public.admin_ai_config
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- Only the designated admin can update configuration
CREATE POLICY "Admin can update admin_ai_config"
    ON public.admin_ai_config
    FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Only the designated admin can delete configuration
CREATE POLICY "Admin can delete admin_ai_config"
    ON public.admin_ai_config
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- Service role has full access (needed for Edge Functions to read config for all users)
CREATE POLICY "Service role full access on admin_ai_config"
    ON public.admin_ai_config
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- RLS Policies for admin_audit_log
-- Only admin can view audit logs
CREATE POLICY "Admin can view admin_audit_log"
    ON public.admin_audit_log
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Admin and service role can insert audit logs
CREATE POLICY "Admin can insert admin_audit_log"
    ON public.admin_audit_log
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY "Service role full access on admin_audit_log"
    ON public.admin_audit_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_admin_ai_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_admin_ai_config_updated_at
    BEFORE UPDATE ON public.admin_ai_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_admin_ai_config_timestamp();
