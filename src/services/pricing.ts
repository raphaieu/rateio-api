export class PricingService {
    // OpenAI Prices (approximate USD per 1k tokens or minute)
    private static RATES = {
        "gpt-4o": {
            inputPer1k: 0.005,
            outputPer1k: 0.015,
        },
        "gpt-4o-mini": {
            inputPer1k: 0.00015,
            outputPer1k: 0.0006,
        },
        "whisper-1": {
            perMinute: 0.006,
        }
    };

    /**
     * Calcula o custo de AI em centavos de Real (BRL)
     */
    static calculateAiCostCents(usage: {
        model: string;
        promptTokens?: number;
        completionTokens?: number;
        durationSeconds?: number;
    }): number {
        const usdRate = parseFloat(process.env.USD_BRL_RATE || "0");
        if (usdRate <= 0) return 0;

        const margin = parseFloat(process.env.AI_COST_MARGIN || "1.5"); // 50% de margem por padrão
        let totalUsd = 0;

        if (usage.model === "gpt-4o" || usage.model === "gpt-4o-mini") {
            const rate = this.RATES[usage.model];
            const inputCost = ((usage.promptTokens || 0) / 1000) * rate.inputPer1k;
            const outputCost = ((usage.completionTokens || 0) / 1000) * rate.outputPer1k;
            totalUsd = inputCost + outputCost;
        } else if (usage.model === "whisper-1") {
            const minutes = (usage.durationSeconds || 0) / 60;
            totalUsd = minutes * this.RATES["whisper-1"].perMinute;
        }

        // Converte USD -> BRL Cents
        // USD * Rate * Margin * 100 (para centavos)
        const costBrlCents = totalUsd * usdRate * margin * 100;

        // Mínimo de 1 centavo se houve uso
        if (totalUsd > 0 && costBrlCents < 1) return 1;

        return Math.ceil(costBrlCents);
    }
}
