/**
 * Vercel Web Analytics Utilities for Hono Backend
 * 
 * This module provides utilities for integrating Vercel Web Analytics
 * into server-rendered HTML pages served by the Hono API.
 */

/**
 * Returns the analytics script tags to be injected into HTML pages.
 * This should be placed in the <head> or before </body> of your HTML.
 * 
 * @returns HTML string containing the analytics script tags
 */
export function getAnalyticsScript(): string {
    return `
<script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/_vercel/insights/script.js"></script>`;
}

/**
 * Wraps HTML content with analytics tracking enabled.
 * Injects the analytics script before the closing </body> tag.
 * 
 * @param htmlContent - The HTML content to wrap
 * @returns HTML content with analytics script injected
 */
export function injectAnalytics(htmlContent: string): string {
    // Check if there's a closing body tag
    if (htmlContent.includes('</body>')) {
        return htmlContent.replace('</body>', `${getAnalyticsScript()}\n</body>`);
    }
    
    // If no body tag, append at the end
    return htmlContent + getAnalyticsScript();
}

/**
 * Creates a complete HTML page with analytics tracking.
 * 
 * @param options - Configuration options for the HTML page
 * @param options.title - Page title
 * @param options.content - HTML content for the body
 * @param options.head - Additional HTML to include in the head (optional)
 * @returns Complete HTML page with analytics
 */
export function createHTMLPageWithAnalytics(options: {
    title: string;
    content: string;
    head?: string;
}): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${options.title}</title>
    ${options.head || ''}
</head>
<body>
    ${options.content}
    ${getAnalyticsScript()}
</body>
</html>`;
}
