// Cadence — daily research stream
// Entries live in the `cadence_entries` Supabase table, generated daily by
// the `cadence-generate` edge function (cron'd via pg_cron at 06:00 UTC).
// This module is the typed data-access layer.

import { supabase } from "@/integrations/supabase/client";

export type CadenceSection = {
  heading: string;
  body: string;
  equation?: string;
};

export type CadenceEntry = {
  slug: string;
  publishDate: string; // YYYY-MM-DD
  concept: string;
  tagline: string;
  discipline: string;
  readMinutes: number;
  whyItMatters: string;
  insideTheSystem: {
    caption: string;
    image: string | null; // data:image/png;base64,... or remote URL
    annotation: string;
  };
  mathematicalCore: CadenceSection[];
  failureModes: string[];
  providersUsed: string[];
};

type DbRow = {
  slug: string;
  publish_date: string;
  concept: string;
  tagline: string;
  discipline: string;
  read_minutes: number;
  why_it_matters: string;
  inside_caption: string;
  inside_annotation: string;
  image_url: string | null;
  mathematical_core: unknown;
  failure_modes: unknown;
  providers_used: unknown;
};

function fromRow(r: DbRow): CadenceEntry {
  const core = Array.isArray(r.mathematical_core) ? (r.mathematical_core as CadenceSection[]) : [];
  const fails = Array.isArray(r.failure_modes) ? (r.failure_modes as string[]) : [];
  const providers = Array.isArray(r.providers_used) ? (r.providers_used as string[]) : [];
  return {
    slug: r.slug,
    publishDate: r.publish_date,
    concept: r.concept,
    tagline: r.tagline,
    discipline: r.discipline,
    readMinutes: r.read_minutes ?? 7,
    whyItMatters: r.why_it_matters,
    insideTheSystem: {
      caption: r.inside_caption,
      image: r.image_url,
      annotation: r.inside_annotation,
    },
    mathematicalCore: core,
    failureModes: fails,
    providersUsed: providers,
  };
}

export async function fetchAllEntries(limit = 60): Promise<CadenceEntry[]> {
  const { data, error } = await supabase
    .from("cadence_entries")
    .select(
      "slug, publish_date, concept, tagline, discipline, read_minutes, why_it_matters, inside_caption, inside_annotation, image_url, mathematical_core, failure_modes, providers_used",
    )
    .order("publish_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => fromRow(r as DbRow));
}

export async function fetchEntryBySlug(slug: string): Promise<CadenceEntry | null> {
  const { data, error } = await supabase
    .from("cadence_entries")
    .select(
      "slug, publish_date, concept, tagline, discipline, read_minutes, why_it_matters, inside_caption, inside_annotation, image_url, mathematical_core, failure_modes, providers_used",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as DbRow) : null;
}

export function formatPublishDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
