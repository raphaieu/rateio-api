# Vercel Web Analytics Integration

This document explains how to use Vercel Web Analytics with the Rateio API backend.

## Overview

The Rateio API is a backend API built with Hono. Since it's primarily a JSON API, Vercel Web Analytics is implemented for any HTML pages that may be served from this backend.

## Prerequisites

- A Vercel account with Web Analytics enabled
- The `@vercel/analytics` package (already installed)
- Vercel deployment with Analytics enabled in the dashboard

## Enabling Web Analytics on Vercel

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select the `rateio-api` project
3. Click the **Analytics** tab
4. Click **Enable** to activate Web Analytics
5. Deploy your application

> **Note:** Enabling Web Analytics will add new routes scoped at `/_vercel/insights/*` after your next deployment.

## Implementation

### For Backend APIs (Current Setup)

Since this is a Hono-based backend API, analytics are implemented using the HTML script injection method. This is suitable for any HTML pages served by the API.

### Using Analytics Utilities

The project includes analytics utilities in `src/utils/analytics.ts` that provide helper functions for injecting analytics into HTML responses.

#### Method 1: Using `createHTMLPageWithAnalytics`

This is the simplest way to create complete HTML pages with analytics:

```typescript
import { Hono } from "hono";
import { createHTMLPageWithAnalytics } from "../utils/analytics.js";

const app = new Hono();

app.get("/my-page", (c) => {
    const htmlPage = createHTMLPageWithAnalytics({
        title: "My Page Title",
        content: `
            <div>
                <h1>My Content</h1>
                <p>This page includes analytics tracking.</p>
            </div>
        `,
        head: `<style>body { font-family: sans-serif; }</style>`
    });

    return c.html(htmlPage);
});
```

#### Method 2: Using `injectAnalytics`

If you already have complete HTML content, use this method to inject analytics:

```typescript
import { injectAnalytics } from "../utils/analytics.js";

app.get("/my-custom-page", (c) => {
    const myHTML = `
        <!DOCTYPE html>
        <html>
        <head><title>My Page</title></head>
        <body>
            <h1>Content</h1>
        </body>
        </html>
    `;

    const htmlWithAnalytics = injectAnalytics(myHTML);
    return c.html(htmlWithAnalytics);
});
```

#### Method 3: Using `getAnalyticsScript`

For manual control, get just the script tags:

```typescript
import { getAnalyticsScript } from "../utils/analytics.js";

app.get("/manual-page", (c) => {
    const analyticsScript = getAnalyticsScript();
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head><title>My Page</title></head>
        <body>
            <h1>Content</h1>
            ${analyticsScript}
        </body>
        </html>
    `;

    return c.html(html);
});
```

## Example

Visit `/analytics/example` to see a working example of analytics integration. This endpoint demonstrates:
- How to serve HTML with analytics tracking
- Proper script placement
- Basic HTML page structure

## API Routes

The following routes now support analytics:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/example` | Example HTML page with analytics tracking |

## Viewing Analytics Data

After deploying your app with analytics enabled:

1. Visit your HTML pages (like `/analytics/example`) to generate page views
2. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
3. Select your project
4. Click the **Analytics** tab
5. View your visitor data, page views, and performance metrics

> **Note:** It may take a few minutes for data to appear in the dashboard.

## Testing Analytics

To verify analytics is working:

1. Deploy your app to Vercel
2. Visit an HTML page that includes analytics (e.g., `/analytics/example`)
3. Open browser DevTools → Network tab
4. Look for a request to `/_vercel/insights/view`
5. If you see this request, analytics is working correctly

## For Frontend Applications

If you're building a separate frontend application that consumes this API, follow the framework-specific instructions:

- **Next.js**: Use `@vercel/analytics/next`
- **React**: Use `@vercel/analytics/react`
- **Vue**: Use `@vercel/analytics/vue`
- **Svelte**: Use `@vercel/analytics/sveltekit`

See the [official Vercel Analytics documentation](https://vercel.com/docs/analytics) for framework-specific setup.

## Notes

- Analytics scripts are loaded from `/_vercel/insights/script.js`
- The script is loaded with `defer` to avoid blocking page rendering
- Analytics only work when deployed to Vercel (not in local development)
- No personally identifiable information (PII) is collected
- Analytics respects user privacy and GDPR compliance

## Troubleshooting

**Analytics not showing data:**
- Ensure Web Analytics is enabled in the Vercel dashboard
- Verify the app is deployed to Vercel (analytics don't work locally)
- Check that the analytics script is loaded in the browser's Network tab
- Wait a few minutes for data to propagate

**Script not loading:**
- Ensure your HTML pages include the analytics script
- Check that `/_vercel/insights/script.js` is accessible
- Verify CORS settings allow the analytics requests

## Related Documentation

- [Vercel Web Analytics Documentation](https://vercel.com/docs/analytics)
- [Vercel Analytics Package](https://vercel.com/docs/analytics/package)
- [Analytics Privacy Policy](https://vercel.com/docs/analytics/privacy-policy)
- [Hono Framework Documentation](https://hono.dev/)
