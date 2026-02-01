import { MercadoPagoConfig, Payment } from "mercadopago";
import { randomUUID } from "node:crypto";

const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

const client = accessToken ? new MercadoPagoConfig({ accessToken }) : null;

export class MercadoPagoService {
    static async createPixPayment(
        transactionAmount: number,
        description: string,
        payerEmail: string,
        metadata: any
    ) {
        if (!client) {
            if (process.env.NODE_ENV === "development") {
                console.warn("Mercado Pago token missing, mocking payment");
                return {
                    id: "mock_" + randomUUID(),
                    point_of_interaction: {
                        transaction_data: {
                            qr_code: "mock_qr_code",
                            qr_code_base64: "mock_base64",
                            ticket_url: "http://mock.url"
                        }
                    }
                };
            }
            throw new Error("Mercado Pago not configured");
        }

        const payment = new Payment(client);

        const body = {
            transaction_amount: transactionAmount,
            description,
            payment_method_id: "pix",
            payer: {
                email: payerEmail
            },
            metadata
        };

        return await payment.create({ body });
    }

    static async getPayment(id: string) {
        if (!client) throw new Error("Mercado Pago not configured");
        const payment = new Payment(client);
        return await payment.get({ id });
    }
}
