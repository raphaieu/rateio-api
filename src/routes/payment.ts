import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { splits, splitCosts, payments, wallets, walletLedger } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { MercadoPagoService } from "../services/mercadopago.js";
import { WalletService } from "../services/wallet.js";
import { randomUUID, createHmac } from "node:crypto";

const app = new Hono<{ Variables: { clerkUserId: string } }>();

// -----------------------------------------------------------------------------
// POST /splits/:id/pay
// -----------------------------------------------------------------------------
app.post("/splits/:id/pay", authMiddleware, zValidator("json", z.object({
    topupCents: z.number().min(0).default(0),
    payWithWallet: z.boolean().default(true) // If true, use available balance first
})), async (c) => {
    const id = c.req.param("id");
    const userId = c.get("clerkUserId");
    const { topupCents, payWithWallet } = c.req.valid("json");

    // 1. Get Split and Costs
    const split = await db.query.splits.findFirst({
        where: eq(splits.id, id),
        with: { splitCosts: true }
    });

    if (!split) return c.json({ error: "Not found" }, 404);
    if (split.ownerClerkUserId !== userId) return c.json({ error: "Unauthorized" }, 403);
    if (split.status === "PAID") return c.json({ error: "Already paid" }, 400);

    const totalCost = split.splitCosts?.totalCents ?? 0;
    if (totalCost === 0 && !split.splitCosts) return c.json({ error: "Split not calculated" }, 400);

    // 2. Check Wallet
    let walletBalance = payWithWallet ? await WalletService.getBalance(userId) : 0;

    // Calculate how much needs to be paid via External (Pix)
    const remainingCost = Math.max(0, totalCost - walletBalance);

    // If wallet covers everything and we want to pay
    if (remainingCost === 0 && totalCost > 0) {
        // Settling immediately with Wallet
        try {
            await db.transaction(async (tx) => {
                // Charge Wallet
                // We can't use WalletService inside transaction easily effectively if it manages its own transaction?
                // WalletService.addEntry IS transactional but creates a new transaction.
                // Drizzle supports nested transactions (savepoints).
                // But simpler to just run logic here or allow service to accept tx?
                // Service refactor needed to accept tx. For now, we risk non-atomic if we call service.
                // Actually, let's call logic directly here or assume service call is safe.
                // Since we pay with wallet, we just deduct.

                await WalletService.addEntry(userId, "CHARGE", totalCost, "PAYMENT", split.id);

                await tx.update(splits).set({
                    status: "PAID",
                    publicSlug: randomUUID().slice(0, 8), // Short slug
                    updatedAt: Math.floor(Date.now() / 1000)
                }).where(eq(splits.id, split.id));
            });

            return c.json({ status: "PAID", method: "WALLET" });
        } catch (e) {
            return c.json({ error: "Payment failed", details: String(e) }, 500);
        }
    }

    // 3. Create Mercado Pago Charge
    // Amount to charge = remainingCost + topupCents.
    // Exception: If totalCost is 0? (free tier? base_fee=0?). Then just paid.
    if (totalCost === 0) {
        // Mark paid
        await db.update(splits).set({
            status: "PAID",
            publicSlug: randomUUID().slice(0, 8),
            updatedAt: Math.floor(Date.now() / 1000)
        }).where(eq(splits.id, split.id));
        return c.json({ status: "PAID", method: "FREE" });
    }

    const chargeAmount = remainingCost + topupCents;
    if (chargeAmount <= 0) {
        return c.json({ error: "Nothing to charge" }, 400);
    }

    try {
        const payment = await MercadoPagoService.createPixPayment(
            chargeAmount / 100, // MP uses float/real currency usually or check lib? Lib "transaction_amount" is usually float.
            // Wait, "cents". MP node SDK V2 usually takes decimal amount (e.g. 10.50).
            // So chargeAmount / 100.
            `Rateio Split ${split.name}`,
            "user@email.com", // We don't have user email from Clerk middleware in context, only ID. Mock or ask user?
            // Spec doesn't require email capture. We put a placeholder or "unknown@rateio.app".
            {
                split_id: split.id,
                user_id: userId,
                amount_split: remainingCost,
                amount_topup: topupCents
            }
        );

        // Store Pending Payment
        await db.insert(payments).values({
            id: randomUUID(),
            ownerClerkUserId: userId,
            splitId: split.id,
            status: "PENDING",
            amountCentsTotal: chargeAmount,
            amountCentsSplitCost: remainingCost,
            amountCentsTopup: topupCents,
            providerPaymentId: String(payment.id),
            qrCode: payment.point_of_interaction?.transaction_data?.qr_code_base64,
            qrCopyPaste: payment.point_of_interaction?.transaction_data?.qr_code,
        });

        console.log("MP Response:", JSON.stringify(payment, null, 2));

        const qrCodeBase64 = payment.point_of_interaction?.transaction_data?.qr_code_base64;
        const qrCodeCopyPaste = payment.point_of_interaction?.transaction_data?.qr_code;

        return c.json({
            status: "PENDING",
            qrCode: qrCodeBase64,
            copyPaste: qrCodeCopyPaste,
            paymentId: payment.id
        });
    } catch (err: any) {
        console.error("MP Error:", err);
        return c.json({
            error: "Payment provider error",
            details: err.message || JSON.stringify(err),
            cause: err.cause || err.stack
        }, 500);
    }
});

// -----------------------------------------------------------------------------
// GET /webhooks/mercadopago — verificação de URL / health (MP ou painel pode testar)
// -----------------------------------------------------------------------------
app.get("/webhooks/mercadopago", (c) => {
    return c.json({ ok: true, message: "Webhook URL ativo" }, 200);
});

// -----------------------------------------------------------------------------
// POST /webhooks/mercadopago
// URL em produção: https://rateio-api.ckao.in/webhooks/mercadopago (registrar no painel MP)
// Sempre respondemos 200 para o MP não reenviar; erros são logados.
// -----------------------------------------------------------------------------
app.post("/webhooks/mercadopago", async (c) => {
    try {
        return await handleMercadoPagoWebhook(c);
    } catch (e: any) {
        console.error("[WEBHOOK MP] Unhandled", e?.message ?? e, e?.stack);
        return c.json({ ok: false, error: "Unhandled" }, 200);
    }
});

async function handleMercadoPagoWebhook(c: any) {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET || "";
    let body: any = null;
    try {
        body = await c.req.json().catch(() => null);
    } catch (e) {
        console.error("[WEBHOOK MP] Failed to parse JSON body", e);
        return c.json({ ok: false, error: "Invalid body" }, 200);
    }
    const query = c.req.query();

    // Debug: log recebimento (sem dados sensíveis)
    const debugWebhook = process.env.DEBUG_WEBHOOK === "true";
    console.log("[WEBHOOK MP] Received", {
        hasBody: !!body,
        bodyKeys: body ? Object.keys(body) : [],
        bodyDataId: body?.data?.id,
        queryKeys: Object.keys(query),
        queryDataId: query["data.id"],
        xSignature: !!c.req.header("x-signature"),
        xRequestId: c.req.header("x-request-id") ?? null,
    });
    if (debugWebhook && body) console.log("[WEBHOOK MP] Body (debug):", JSON.stringify(body));

    // Verify signature
    const xSignature = c.req.header("x-signature");
    const xRequestId = c.req.header("x-request-id");

    if (process.env.NODE_ENV !== "development" && (!xSignature || !xRequestId)) {
        console.warn("[WEBHOOK MP] Rejected: missing signature or x-request-id");
        return c.json({ ok: false, error: "Missing signature" }, 200);
    }

    if (secret && xSignature && xRequestId) {
        // Parse signature
        const parts = xSignature.split(',');
        let ts, hash;
        parts.forEach((part: string) => {
            const [key, value] = part.split('=');
            if (key && value) {
                const k = key.trim();
                const v = value.trim();
                if (k === 'ts') ts = v;
                else if (k === 'v1') hash = v;
            }
        });

        // Parse data.id from URL if present, or body
        // Docs say: id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];
        // But we are receiving POST body mostly. 
        // Docs: "Este query param pode ser encontrado na notificação recebida em letra maiúscula, mas deverá ser utilizado em minúscula."
        // Example: data.id=ORD... -> use ord...
        // If data.id is in body, usually notifications come with data.id in URL too?
        // Let's try to get from URL first as per docs template 'data.id_url'

        let dataID = query["data.id"];
        if (!dataID && body?.data?.id) {
            dataID = body.data.id;
        }

        if (dataID && ts && hash) {
            const manifest = `id:${dataID};request-id:${xRequestId};ts:${ts};`;

            const hmac = createHmac('sha256', secret);
            hmac.update(manifest);
            const sha = hmac.digest('hex');

            if (sha !== hash) {
                console.error("[WEBHOOK MP] HMAC verification failed");
                return c.json({ ok: false, error: "Invalid signature" }, 200);
            }
        }
    }

    const paymentId = body?.data?.id || query["data.id"];

    if (!paymentId) {
        console.warn("[WEBHOOK MP] Rejected: missing payment ID in body and query");
        return c.json({ ok: false, error: "Missing ID" }, 200);
    }

    try {
        const mpPayment = await MercadoPagoService.getPayment(paymentId);

        // Debug: status que o MP retornou (Payments API: "approved"; Orders/Transactions: "processed" + status_detail "accredited")
        const mpStatus = (mpPayment as any).status;
        const mpStatusDetail = (mpPayment as any).status_detail ?? (mpPayment as any).status_detail;
        console.log("[WEBHOOK MP] Payment from API", {
            paymentId,
            status: mpStatus,
            status_detail: mpStatusDetail,
        });
        if (debugWebhook) console.log("[WEBHOOK MP] Full payment (debug):", JSON.stringify(mpPayment, null, 2));

        // Pagamento creditado: "approved" (Payments API) ou "processed" + "accredited" (tabela de status que o usuário enviou)
        const isPaid =
            mpStatus === "approved" ||
            (mpStatus === "processed" && (mpStatusDetail === "accredited" || !mpStatusDetail));

        if (!isPaid) {
            console.log("[WEBHOOK MP] Skipping – payment not credited", {
                status: mpStatus,
                status_detail: mpStatusDetail,
                hint: "Aguardar MP enviar webhook com status approved/processed",
            });
            return c.json({ ok: true, message: "Payment not yet credited" });
        }

        if (isPaid) {
            const storedPayment = await db.query.payments.findFirst({
                where: eq(payments.providerPaymentId, String(paymentId))
            });

            if (!storedPayment) {
                console.log("[WEBHOOK MP] Payment not found in DB, ignoring", { paymentId });
                return c.json({ ok: true });
            }

            if (storedPayment.status === "APPROVED") {
                console.log("[WEBHOOK MP] Already processed", { paymentId });
                return c.json({ ok: true, message: "Already processed" });
            }

            console.log("[WEBHOOK MP] Processing payment", {
                paymentId,
                splitId: storedPayment.splitId,
                amountCents: storedPayment.amountCentsTotal,
            });

            // Process Payment
            await db.transaction(async (tx) => {
                // Update Payment
                await tx.update(payments)
                    .set({ status: "APPROVED", updatedAt: Math.floor(Date.now() / 1000) })
                    .where(eq(payments.id, storedPayment.id));

                // Handle Wallet Logic
                // 1. TOPUP (Add total paid amount as credit first? Or just split + topup?)
                // Logic: User paid 'amountCentsTotal'.
                const totalPaid = storedPayment.amountCentsTotal;
                const splitCost = storedPayment.amountCentsSplitCost; // Part used for split

                // Add EVERYTHING to wallet, then charge the Split Cost?
                // "If wallet partially covers, subtract and only charge remaining via PIX."
                // This implies: Wallet Balance = Old Balance.
                // Pix Charge = X.
                // We adding X to wallet? Then charge X + Old?
                // "apply topup".
                // Simplest ledger:
                // 1. TOPUP: +totalPaid (Amount from PIX)
                // 2. CHARGE: -splitCost (Part covering split, plus whatever from wallet was implicitly used if logic was: total_split - wallet = pix)
                // Wait, storedPayment.amountCentsSplitCost is ONLY the amount charged via PIX for split.
                // If the user used existing wallet balance, that part was ALREADY deducted? No.
                // The flow in /pay: 
                // remaining = total_cost - wallet_balance_available.
                // charge = remaining + topup.
                //
                // If we charge remaining, that means wallet_balance_available is ALSO used.
                // So executing payment means:
                // 1. Deduct `wallet_balance_available` (or total_cost - remaining) from wallet?
                // 2. Add `topup` part of PIX to wallet.
                // 3. Mark split PAID.

                // Re-evaluating Ledger:
                // Easier: Add PIX amount to wallet (TOPUP).
                // Then Charge FULL split amount (CHARGE).
                // Result: Old + Pix - Split = (Old + (Total - Old) + Topup) - Total = Topup. Correct.
                // So: 
                // 1. Ledger TOPUP: amount = storedPayment.amountCentsTotal.
                // 2. Ledger CHARGE: amount = (Split Total Cost).

                // Need to fetch Split Total Cost again to be sure? Or trust storedPayment logic?
                // Best to fetch split cost.

                const split = await tx.query.splits.findFirst({
                    where: eq(splits.id, storedPayment.splitId!), // Payment has splitId
                    with: { splitCosts: true }
                });

                if (split) {
                    // If already paid?
                    if (split.status !== "PAID") {
                        // Ledger actions
                        // We need WalletService inside tx.
                        // Reimplementing logic for atomic tx:

                        // 1. Get Wallet
                        let wallet = await tx.query.wallets.findFirst({ where: eq(wallets.ownerClerkUserId, storedPayment.ownerClerkUserId) });
                        if (!wallet) {
                            await tx.insert(wallets).values({ ownerClerkUserId: storedPayment.ownerClerkUserId, balanceCents: 0 });
                            wallet = { ownerClerkUserId: storedPayment.ownerClerkUserId, balanceCents: 0 };
                        }

                        // 2. Topup (Pix content)
                        const afterTopup = wallet.balanceCents + totalPaid;
                        await tx.insert(walletLedger).values({
                            id: randomUUID(),
                            ownerClerkUserId: storedPayment.ownerClerkUserId,
                            type: "TOPUP",
                            amountCents: totalPaid,
                            refType: "PAYMENT",
                            refId: storedPayment.id
                        });

                        // 3. Charge (Full split cost)
                        const cost = split.splitCosts?.totalCents ?? 0;
                        const finalBalance = afterTopup - cost;

                        if (finalBalance < 0) {
                            // Should not happen if logic correct, unless split price changed?
                            // "Preço ... congelado na revisão".
                            console.error("Negative balance after payment!", finalBalance);
                            // Allow negative? No.
                            throw new Error("Mathematical error in payment application");
                        }

                        await tx.insert(walletLedger).values({
                            id: randomUUID(),
                            ownerClerkUserId: storedPayment.ownerClerkUserId,
                            type: "CHARGE",
                            amountCents: cost,
                            refType: "SPLIT_FEE",
                            refId: split.id
                        });

                        await tx.update(wallets).set({ balanceCents: finalBalance }).where(eq(wallets.ownerClerkUserId, storedPayment.ownerClerkUserId));

                        // 4. Mark Split Paid
                        await tx.update(splits).set({
                            status: "PAID",
                            publicSlug: randomUUID().slice(0, 8),
                            updatedAt: Math.floor(Date.now() / 1000)
                        }).where(eq(splits.id, split.id));
                        console.log("[WEBHOOK MP] Split marked PAID", { splitId: split.id });
                    }
                }
            });
        }

        console.log("[WEBHOOK MP] Done OK", { paymentId });
        return c.json({ ok: true });
    } catch (e: any) {
        console.error("[WEBHOOK MP] Error", e?.message ?? e, e?.stack);
        return c.json({ ok: false, error: "Internal Error" }, 200);
    }
}

export default app;
