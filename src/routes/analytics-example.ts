import { Hono } from "hono";
import { createHTMLPageWithAnalytics } from "../utils/analytics.js";

const app = new Hono();

/**
 * Example endpoint that serves an HTML page with analytics tracking.
 * This demonstrates how to use Vercel Web Analytics in server-rendered pages.
 */
app.get("/example", (c) => {
    const htmlPage = createHTMLPageWithAnalytics({
        title: "Rateio API - Analytics Example",
        content: `
            <div style="max-width: 800px; margin: 50px auto; font-family: system-ui, -apple-system, sans-serif; padding: 20px;">
                <h1>Vercel Web Analytics Example</h1>
                <p>This page demonstrates Vercel Web Analytics integration with Hono backend.</p>
                <p>When deployed to Vercel with analytics enabled, this page will track:</p>
                <ul>
                    <li>Page views</li>
                    <li>Visitor analytics</li>
                    <li>Performance metrics</li>
                </ul>
                <p><a href="/health">Check API Health</a></p>
                <p><a href="/pricing/current">View Pricing</a></p>
            </div>
        `,
        head: `
            <style>
                body {
                    background-color: #f5f5f5;
                }
                a {
                    color: #0070f3;
                    text-decoration: none;
                }
                a:hover {
                    text-decoration: underline;
                }
            </style>
        `
    });

    return c.html(htmlPage);
});

export default app;
