# Admin AI Configuration System

**Last Updated:** 2026-08-30  
**Version:** 1.0.0  
**Status:** Production-Ready

---

## Overview

The Admin Configuration System allows the designated administrator (`pardhan9013334137@gmail.com`) to configure a **centralized AI provider** that will be used globally by all EntropyLite users who have not configured their own API keys.

### Key Features

- **Server-Authoritative Security**: Admin role is enforced server-side through authenticated user identity
- **Encrypted Credential Storage**: API keys are encrypted at rest using AES-GCM
- **Three-Tier Request Hierarchy**: User API → Admin Global AI → System Fallback
- **Zero Key Exposure**: API keys never transmitted to frontend or exposed in responses
- **Audit Trail**: All configuration changes are logged
- **Production-Grade Integration**: Seamlessly integrates with existing AI infrastructure

---

## Architecture

### Request Routing Hierarchy

```
AI Request
    ↓
┌─────────────────────────────────────┐
│ 1. User-Specific API Key            │
│    (if explicitly configured)       │
└─────────────────────────────────────┘
    ↓ (if not configured)
┌─────────────────────────────────────┐
│ 2. Admin Global AI Configuration    │
│    (centrally managed in database)  │
└─────────────────────────────────────┘
    ↓ (if not configured or fails)
┌─────────────────────────────────────┐
│ 3. System Workspace Routing         │
│    Mistral 1-3 → Gemini → 1min.ai   │
│    → Lovable Gateway                │
└─────────────────────────────────────┘
```

### Security Model

#### Admin Identification
- **Admin Email**: `pardhan9013334137@gmail.com` (hardcoded, case-insensitive)
- **Authorization**: Server-side validation via `isAdmin(user)` helper
- **Cannot be bypassed**: Client-side checks are for UI only; all operations enforced server-side

#### API Key Security
- **Encryption**: AES-GCM 256-bit encryption
- **Storage**: Encrypted in `admin_ai_config.api_key_encrypted` column
- **Decryption**: Only in Edge Functions, never exposed to frontend
- **Transmission**: Frontend sends plaintext key only during save; immediately discarded after encryption
- **Retrieval**: GET endpoints return metadata only, never the API key

#### Row-Level Security (RLS)
```sql
-- Only admin can read/write admin_ai_config
CREATE POLICY "Admin can view admin_ai_config"
  ON public.admin_ai_config FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Service role has full access for Edge Functions
CREATE POLICY "Service role full access on admin_ai_config"
  ON public.admin_ai_config FOR ALL
  TO service_role
  USING (true);
```

---

## Database Schema

### `admin_ai_config` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `provider` | text | AI provider name (mistral, openai, gemini, anthropic, openrouter, custom) |
| `model` | text | Model identifier |
| `api_key_encrypted` | text | AES-GCM encrypted API key |
| `base_url` | text | Optional custom endpoint URL |
| `api_version` | text | Optional API version |
| `enabled` | boolean | Global AI routing enabled/disabled |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |
| `updated_by` | uuid | Foreign key to auth.users |

**Constraints**:
- Only one configuration row allowed (enforced by unique index)
- RLS policies restrict access to admin email only

### `admin_audit_log` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `user_id` | uuid | Foreign key to auth.users |
| `user_email` | text | Email of user who performed action |
| `action` | text | Action type (CONFIG_CREATED, CONFIG_UPDATED, etc.) |
| `details` | jsonb | Additional metadata (never contains API keys) |
| `created_at` | timestamptz | Timestamp |

**Audit Actions**:
- `CONFIG_CREATED`
- `CONFIG_UPDATED`
- `CONFIG_ENABLED`
- `CONFIG_DISABLED`
- `CONFIG_DELETED`
- `CONNECTION_TESTED`

---

## API Endpoints

### Edge Function: `/admin-ai-config`

#### `GET /`
Fetch current admin AI configuration (metadata only).

**Request**:
```http
GET /functions/v1/admin-ai-config
Authorization: Bearer <user-jwt-token>
```

**Response**:
```json
{
  "config": {
    "id": "uuid",
    "provider": "mistral",
    "model": "mistral-large-latest",
    "baseUrl": "https://api.mistral.ai/v1/chat/completions",
    "apiVersion": null,
    "enabled": true,
    "createdAt": "2026-08-30T07:00:00.000Z",
    "updatedAt": "2026-08-30T07:00:00.000Z"
  }
}
```

**Note**: API key is NEVER returned.

#### `POST /`
Save or update admin AI configuration.

**Request**:
```http
POST /functions/v1/admin-ai-config
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

{
  "provider": "openai",
  "model": "gpt-4o",
  "apiKey": "sk-proj-...",
  "baseUrl": "https://api.openai.com/v1/chat/completions",
  "enabled": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Configuration saved"
}
```

#### `DELETE /`
Remove admin AI configuration.

**Request**:
```http
DELETE /functions/v1/admin-ai-config
Authorization: Bearer <admin-jwt-token>
```

**Response**:
```json
{
  "success": true,
  "message": "Configuration deleted"
}
```

#### `POST /test`
Test AI connection with provided or saved credentials.

**Request** (test saved config):
```http
POST /functions/v1/admin-ai-config/test
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

{}
```

**Request** (test new credentials before saving):
```http
POST /functions/v1/admin-ai-config/test
Authorization: Bearer <admin-jwt-token>
Content-Type: application/json

{
  "provider": "mistral",
  "model": "mistral-large-latest",
  "apiKey": "test-key",
  "baseUrl": "https://api.mistral.ai/v1/chat/completions"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Connection successful",
  "latencyMs": 234
}
```

---

## Frontend Components

### Admin Detection Hook

```typescript
import { useAdmin } from "@/hooks/useAdmin";

function MyComponent() {
  const { isAdmin, loading, user } = useAdmin();
  
  if (loading) return <div>Loading...</div>;
  
  if (isAdmin) {
    return <AdminControls />;
  }
  
  return <RegularUserView />;
}
```

### Admin AI Config Panel

Located at: `/dashboard` → **System** tab → **Admin Control** section

**Visible to**: `pardhan9013334137@gmail.com` only

**Features**:
- Provider selection dropdown
- Model name input
- API key input (password field)
- Base URL input (optional)
- Enable/disable toggle
- Test Connection button
- Save Configuration button
- Remove Configuration button
- Connection status indicator

---

## Usage Instructions

### For the Admin

1. **Navigate to System Page**
   - Log in as `pardhan9013334137@gmail.com`
   - Go to `/dashboard`
   - Click **System** tab
   - Scroll to **Admin Control** section

2. **Configure Global AI**
   - Select AI provider from dropdown
   - Enter model name (e.g., `gpt-4o`, `mistral-large-latest`)
   - Paste API key
   - (Optional) Enter custom base URL
   - Click **Test Connection** to verify
   - Click **Save Configuration**

3. **Enable Global AI**
   - Toggle **Enable Global AI Routing** switch
   - Save configuration

4. **Monitor Status**
   - Connection status shows: ● Connected (123ms) or ✗ Failed
   - Last updated timestamp displayed
   - Audit log tracks all changes

### For Regular Users

**No changes required**. The system transparently uses the admin-configured provider when:
1. User has not configured their own API key
2. Admin Global AI is enabled
3. Admin Global AI is successfully configured

If admin API fails, the system automatically falls back to existing Mistral workspaces and emergency providers.

---

## Supported Providers

| Provider | Default Model | Base URL |
|----------|--------------|----------|
| **Mistral AI** | `mistral-large-latest` | `https://api.mistral.ai/v1/chat/completions` |
| **OpenAI** | `gpt-4o` | `https://api.openai.com/v1/chat/completions` |
| **Google Gemini** | `gemini-2.0-flash` | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| **Anthropic Claude** | `claude-3-7-sonnet-20250219` | `https://api.anthropic.com/v1/messages` |
| **OpenRouter** | `anthropic/claude-3.7-sonnet` | `https://openrouter.ai/api/v1/chat/completions` |
| **Custom / Self-Hosted** | `default` | (Required: enter custom URL) |

---

## Testing Checklist

✅ **Authorization Tests**
- [ ] `pardhan9013334137@gmail.com` → Admin access granted
- [ ] Any other email → Admin access denied
- [ ] Case insensitivity works
- [ ] Whitespace trimming works

✅ **Security Tests**
- [ ] API keys never appear in frontend responses
- [ ] API keys never appear in browser DevTools
- [ ] API keys never appear in application logs
- [ ] Non-admin cannot call admin endpoints (403 response)
- [ ] Encryption/decryption works correctly

✅ **Routing Tests**
- [ ] User API takes priority when configured
- [ ] Admin API used when user API not configured
- [ ] System fallback works when admin API fails
- [ ] Disabled admin API skips to fallback

✅ **UI Tests**
- [ ] Admin Control section visible to admin
- [ ] Admin Control section invisible to non-admin
- [ ] Configuration persists after page refresh
- [ ] Test Connection button works
- [ ] Save Configuration button works
- [ ] Remove Configuration button works

✅ **Integration Tests**
- [ ] Multiple concurrent users can use admin global provider
- [ ] Admin can change provider without code deployment
- [ ] Provider failure triggers fallback correctly
- [ ] Audit log records all configuration changes

---

## Troubleshooting

### Issue: "Admin Control" section not visible

**Solution**:
1. Verify you're logged in as `pardhan9013334137@gmail.com` (case-insensitive)
2. Check browser console for errors
3. Ensure you're on the System tab (`/dashboard` → System)

### Issue: "Connection test failed"

**Causes**:
- Invalid API key
- Incorrect provider/model combination
- Network connectivity issues
- Provider service outage

**Solution**:
1. Verify API key is correct and active
2. Check provider's model name documentation
3. Test base URL directly with curl/Postman
4. Check provider status page

### Issue: "Save failed"

**Causes**:
- Missing required fields (provider, model, apiKey)
- Database connection issues
- Encryption failure

**Solution**:
1. Ensure all required fields are filled
2. Check Supabase Edge Function logs
3. Verify database migrations are applied

### Issue: Users still hitting system fallback

**Causes**:
- Admin Global AI is disabled
- Admin API key is invalid/expired
- Provider rate limit exceeded

**Solution**:
1. Verify "Enable Global AI Routing" toggle is ON
2. Test connection to verify API key is valid
3. Check provider rate limits and billing status

---

## File Reference

### Backend (Deno/Edge Functions)
- `supabase/migrations/20260830000000_admin_ai_config.sql` - Database schema
- `supabase/functions/_shared/adminAuth.ts` - Authorization helpers
- `supabase/functions/_shared/adminTypes.ts` - TypeScript types
- `supabase/functions/_shared/adminAIProvider.ts` - Config fetcher
- `supabase/functions/_shared/crypto.ts` - Encryption/decryption
- `supabase/functions/_shared/customAICaller.ts` - Generic AI caller
- `supabase/functions/_shared/callAI.ts` - Main AI router (updated)
- `supabase/functions/admin-ai-config/index.ts` - Edge Function handler

### Frontend (React)
- `src/types/adminAIConfig.ts` - TypeScript types
- `src/hooks/useAdmin.ts` - Admin detection hook
- `src/lib/adminAIConfig.ts` - API client utilities
- `src/components/system/AdminAIConfigPanel.tsx` - Admin UI panel
- `src/components/system/SystemPipeline.tsx` - System page (updated)

### Tests
- `src/test/admin-config.test.ts` - Comprehensive test suite

---

## Security Considerations

### What is Secure

✅ API keys encrypted at rest (AES-GCM 256-bit)  
✅ Server-side authorization (cannot be bypassed)  
✅ RLS policies enforce database-level access control  
✅ API keys never transmitted to frontend  
✅ Audit trail of all configuration changes  
✅ API keys not logged or exposed in errors  

### What to Monitor

⚠️ Admin account security (strong password, 2FA if available)  
⚠️ API key rotation schedule (provider best practices)  
⚠️ Audit log for unauthorized access attempts  
⚠️ Provider rate limits and billing alerts  
⚠️ Fallback provider health  

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Non-admin accesses config | RLS policies + server-side auth checks |
| API key leaked in logs | Keys never logged; only provider/model metadata |
| API key intercepted in transit | HTTPS + never sent to frontend after save |
| Brute-force admin access | Supabase auth handles rate limiting |
| SQL injection | Parameterized queries + RLS |
| XSS/CSRF | Supabase JWT + CORS headers |

---

## Maintenance

### Rotating Admin AI Key

1. Log in as admin
2. Go to System → Admin Control
3. Enter new API key
4. Test connection
5. Save configuration
6. Old key is immediately overwritten

### Disabling Global AI

1. Toggle "Enable Global AI Routing" to OFF
2. Save configuration
3. System reverts to workspace/fallback routing
4. Configuration remains saved for re-enabling later

### Monitoring Usage

```sql
-- View audit log
SELECT * FROM admin_audit_log 
ORDER BY created_at DESC 
LIMIT 20;

-- Check current config
SELECT provider, model, enabled, updated_at 
FROM admin_ai_config;
```

---

## Future Enhancements

- [ ] Support for multiple admin users
- [ ] API key rotation reminders
- [ ] Usage analytics per provider
- [ ] Cost tracking integration
- [ ] Provider health monitoring dashboard
- [ ] Backup provider configuration
- [ ] Per-user provider override UI

---

## Support

For issues or questions:
1. Check this documentation
2. Review Edge Function logs in Supabase dashboard
3. Check browser console for frontend errors
4. Review test suite in `src/test/admin-config.test.ts`
5. Open GitHub issue with reproduction steps

---

**End of Documentation**
