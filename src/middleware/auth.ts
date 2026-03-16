import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";
import { HTTPException } from "hono/http-exception";

type AuthVariables = {
    clerkUserId?: string;
    guestId?: string;
};

export const populateAuth = createMiddleware<{ Variables: AuthVariables }>(
    async (c, next) => {
        // Skip if already populated (for nested calls)
        if (c.get("clerkUserId") || c.get("guestId")) {
            return await next();
        }

        const authHeader = c.req.header("Authorization");
        const guestIdHeader = c.req.header("x-guest-id");

        if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.split(" ")[1];
            try {
                const verified = await verifyToken(token, {
                    secretKey: process.env.CLERK_SECRET_KEY,
                });

                if (verified.sub) {
                    c.set("clerkUserId", verified.sub);
                }
            } catch (err: any) {
                // Don't log expected errors for unauthenticated users if you want them silent
                // console.error("Auth error:", err);
            }
        }

        if (guestIdHeader) {
            c.set("guestId", guestIdHeader);
        }

        await next();
    }
);

/**
 * STRICT middleware: throws 401 if no identification found.
 */
export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
    async (c, next) => {
        // Ensure context is populated
        await populateAuth(c, async () => { });

        if (c.get("clerkUserId") || c.get("guestId")) {
            return await next();
        }

        throw new HTTPException(401, { message: "Missing or invalid authentication (Clerk or Guest)" });
    }
);
