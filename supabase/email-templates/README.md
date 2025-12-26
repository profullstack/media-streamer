# BitTorrented Email Templates

Branded email templates for Supabase Auth.

## Templates

| Template | File | Purpose |
|----------|------|---------|
| Confirm Signup | `confirm-signup.html` | Email verification for new users |
| Reset Password | `reset-password.html` | Password reset requests |
| Magic Link | `magic-link.html` | Passwordless sign-in |
| Invite User | `invite-user.html` | Family plan invitations |

## Quick Setup (Automated)

Use the provided script to automatically update all email templates in Supabase:

```bash
# Set required environment variables
export SUPABASE_PROJECT_REF=your-project-ref
export SUPABASE_ACCESS_TOKEN=your-access-token

# Run the update script
pnpm supabase:update-emails
```

### Getting the Required Values

1. **SUPABASE_PROJECT_REF**: Find this in your Supabase project URL:
   `https://supabase.com/dashboard/project/<PROJECT_REF>`

2. **SUPABASE_ACCESS_TOKEN**: Generate at:
   `https://supabase.com/dashboard/account/tokens`

## Manual Configuration

### Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Email Templates**
3. For each template type, copy the HTML content from the corresponding file
4. Paste into the template editor
5. Save changes

### Template Variables

Supabase uses Go template syntax. Available variables:

| Variable | Description |
|----------|-------------|
| `{{ .ConfirmationURL }}` | The action URL (confirm, reset, etc.) |
| `{{ .Email }}` | User's email address |
| `{{ .Token }}` | The confirmation token |
| `{{ .TokenHash }}` | Hashed token for security |
| `{{ .SiteURL }}` | Your site URL |

### Email Settings

Configure these in **Authentication** → **Email Templates** → **SMTP Settings**:

```
From Name: BitTorrented
From Email: noreply@bittorrented.com
```

### Subject Lines

Recommended subject lines for each template:

| Template | Subject |
|----------|---------|
| Confirm Signup | Confirm your email - BitTorrented |
| Reset Password | Reset your password - BitTorrented |
| Magic Link | Sign in to BitTorrented |
| Invite User | You're invited to BitTorrented! |

## Design System

The templates use the BitTorrented design system:

### Colors

```css
/* Background */
--bg-primary: #0a0a0a;
--bg-secondary: #171717;
--bg-tertiary: #262626;

/* Text */
--text-primary: #ffffff;
--text-secondary: #a3a3a3;
--text-muted: #737373;

/* Accent */
--accent-primary: #8b5cf6;
--accent-secondary: #6366f1;

/* Status */
--status-success: #22c55e;
--status-warning: #fbbf24;
--status-error: #ef4444;
```

### Typography

- Font: System font stack (Apple, Segoe UI, Roboto)
- Headings: 24px, 600 weight
- Body: 16px, 400 weight
- Small: 14px, 400 weight

### Components

- Cards: 16px border-radius, 1px border
- Buttons: 12px border-radius, gradient background
- Info boxes: 8px border-radius, colored borders

## Testing

To test email templates:

1. Create a test user in Supabase
2. Trigger the relevant auth action
3. Check the email in your inbox
4. Verify links work correctly

## Customization

To customize templates:

1. Edit the HTML files in this directory
2. Test locally by opening in a browser
3. Update in Supabase dashboard
4. Test with real emails

## Troubleshooting

### Emails not sending

1. Check SMTP settings in Supabase
2. Verify email provider configuration
3. Check spam folder

### Links not working

1. Verify `NEXT_PUBLIC_SITE_URL` is set correctly
2. Check redirect URLs in Supabase Auth settings
3. Ensure the route exists in your app

### Styling issues

1. Use inline styles (email clients don't support external CSS)
2. Test in multiple email clients
3. Use tables for complex layouts (better email client support)
