import "dotenv/config";
import { authMiddleware } from "./middleware/auth.js";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import splitsRoute from "./routes/splits.js";
import paymentRoute from "./routes/payment.js";
import publicRoute from "./routes/public.js";

const app = new Hono();

app.use("*", logger());
app.use(
    "*",
    cors({
        origin: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "https://rateio.ckao.in",
            "https://rateio-web.vercel.app"
        ],
        allowHeaders: ["Content-Type", "Authorization", "x-signature", "x-request-id", "X-Idempotency-Key"],
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        credentials: true
    })
);

app.get("/health", (c) => c.text("ok"));

app.get("/me", authMiddleware, (c) => {
    return c.json({ clerkUserId: c.get("clerkUserId") });
});


app.get("/pricing/current", (c) => {
    return c.json({
        baseFeeCents: parseInt(process.env.BASE_FEE_CENTS || "0", 10),
        aiTiers: [
            {
                maxChars: parseInt(process.env.AI_TEXT_TIER_1_MAX_CHARS || "0", 10),
                cents: parseInt(process.env.AI_TEXT_TIER_1_CENTS || "0", 10),
            },
            {
                maxChars: parseInt(process.env.AI_TEXT_TIER_2_MAX_CHARS || "0", 10),
                cents: parseInt(process.env.AI_TEXT_TIER_2_CENTS || "0", 10),
            },
            {
                maxChars: parseInt(process.env.AI_TEXT_TIER_3_MAX_CHARS || "0", 10),
                cents: parseInt(process.env.AI_TEXT_TIER_3_CENTS || "0", 10),
            },
        ],
    });
});

app.route("/splits", splitsRoute);
app.route("/", paymentRoute);
app.route("/public", publicRoute);

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
    fetch: app.fetch,
    port,
});

export default app;
