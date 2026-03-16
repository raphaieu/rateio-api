import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";
import { HTTPException } from "hono/http-exception";

type AuthVariables = {
    clerkUserId?: string;
    guestId?: string;
};

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
    async (c, next) => {
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
                    return await next();
                }
            } catch (err: any) {
                console.error("Auth error:", err);
            }
        }

        if (guestIdHeader) {
            c.set("guestId", guestIdHeader);
            return await next();
        }

        // If neither Clerk nor Guest, but we might want to allow some routes to be public?
        // Routes using this middleware expect either clerkUserId or guestId.
        throw new HTTPException(401, { message: "Missing or invalid authentication (Clerk or Guest)" });
    }
);
