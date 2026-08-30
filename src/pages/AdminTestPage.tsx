/**
 * Development-only page to test Admin Configuration Panel
 * Access at: http://localhost:5173/admin-test
 *
 * This bypasses authentication to allow UI testing when cloud credits are exhausted.
 * DELETE THIS FILE before deploying to production.
 */

import { useState } from "react";
import AdminAIConfigPanel from "@/components/system/AdminAIConfigPanel";
import { ArrowLeft } from "lucide-react";

export default function AdminTestPage() {
  const [showWarning, setShowWarning] = useState(true);

  return (
    <div className="min-h-screen bg-background">
      {/* Warning Banner */}
      {showWarning && (
        <div className="bg-destructive/10 border-b border-destructive/20 p-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              <p className="text-sm font-medium text-destructive">
                Development Mode - Authentication Bypassed
              </p>
              <span className="text-xs text-muted-foreground">
                This page is for UI testing only. Backend operations won't work without Supabase credits.
              </span>
            </div>
            <button
              onClick={() => setShowWarning(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-3xl mx-auto p-8">
        <div className="mb-8">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Landing
          </a>
          <h1 className="text-3xl font-bold mb-2">Admin Configuration Panel Test</h1>
          <p className="text-sm text-muted-foreground">
            Testing the admin UI without authentication. The panel below is fully functional
            but backend operations (Save, Test Connection, Delete) require Supabase credits.
          </p>
        </div>

        {/* Admin Panel */}
        <AdminAIConfigPanel />

        {/* Status Info */}
        <div className="mt-8 p-4 rounded-lg border border-border/50 bg-muted/30">
          <h3 className="text-sm font-semibold mb-2">What Works Without Backend:</h3>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li>✅ UI Layout and Styling</li>
            <li>✅ Provider Selection Dropdown</li>
            <li>✅ Form Inputs (Model, API Key, Base URL)</li>
            <li>✅ Enable/Disable Toggle</li>
            <li>✅ Responsive Design</li>
          </ul>
          <h3 className="text-sm font-semibold mt-4 mb-2">What Needs Supabase:</h3>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li>❌ Loading Saved Configuration (GET /admin-ai-config)</li>
            <li>❌ Test Connection (POST /admin-ai-config/test)</li>
            <li>❌ Save Configuration (POST /admin-ai-config)</li>
            <li>❌ Delete Configuration (DELETE /admin-ai-config)</li>
          </ul>
        </div>

        {/* Test Instructions */}
        <div className="mt-6 p-4 rounded-lg border border-primary/20 bg-primary/5">
          <h3 className="text-sm font-semibold mb-2 text-primary">Testing Instructions:</h3>
          <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Select a provider from the dropdown (e.g., Mistral, OpenAI, Gemini)</li>
            <li>Enter a model name (e.g., "gpt-4o", "mistral-large-latest")</li>
            <li>Enter a fake API key in the password field</li>
            <li>Toggle "Enable Global AI Routing" on/off</li>
            <li>Click buttons to see loading states (they'll error without backend)</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
