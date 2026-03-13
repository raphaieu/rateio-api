import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export class OpenAIService {
    /**
     * Transcreve áudio usando Whisper
     */
    static async transcribeAudio(file: File | Blob): Promise<string> {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY não configurada no servidor.");
        }

        const transcription = await openai.audio.transcriptions.create({
            file: file as any,
            model: "whisper-1",
            language: "pt",
        });

        return transcription.text;
    }

    /**
     * Extrai itens (nome e valor) de um texto usando GPT-4o-mini
     */
    static async parseItemsFromText(text: string): Promise<{ name: string; amountCents: number }[]> {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY não configurada no servidor.");
        }


        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Você é um assistente especializado em extrair itens de comandas e contas de restaurante.
Analise o texto e identifique os produtos/serviços e seus respectivos valores.
Retorne APENAS um JSON no formato: {"items": [{"name": string, "amountCents": number}]}.
- name: Nome do item (ex: "Açaí de morango")
- amountCents: Valor total do item em centavos (ex: "R$ 22,00" -> 2200, "15,50" -> 1550)
Se não encontrar itens, retorne {"items": []}.`
                },
                {
                    role: "user",
                    content: text
                }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content || "{}";

        try {
            const parsed = JSON.parse(content);
            const items = Array.isArray(parsed.items) ? parsed.items : [];

            return items.map((it: any) => ({
                name: String(it.name || "Item sem nome"),
                amountCents: Math.round(Number(it.amountCents || 0))
            }));
        } catch (e) {
            console.error("[OpenAIService] JSON Parse Error:", e);
            return [];
        }
    }

    /**
     * Extrai nomes de pessoas de um texto transcrito
     */
    static async parseParticipantsFromText(text: string): Promise<string[]> {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY não configurada no servidor.");
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Extraia nomes de pessoas de um texto. Retorne APENAS um JSON no formato: {"names": [string]}.
Se o usuário disser "João, Maria e Pedro", retorne ["João", "Maria", "Pedro"].
Ignore palavras que não sejam nomes próprios.`
                },
                {
                    role: "user",
                    content: text
                }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content || "{}";
        const parsed = JSON.parse(content);
        return Array.isArray(parsed.names) ? parsed.names : [];
    }

    /**
     * Realiza OCR em uma imagem de comanda usando GPT-4o
     */
    static async parseItemsFromImage(base64Image: string): Promise<{ name: string; amountCents: number }[]> {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY não configurada no servidor.");
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Você é um especialista em OCR de comandas de restaurante.
Analise a imagem e extraia os itens consumidos (nome e valor unitário ou total do item).
Retorne APENAS um JSON no formato: {"items": [{"name": string, "amountCents": number}]}.
Converta valores para centavos. Ignore totais gerais, foque nos itens da lista.`
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Extraia os itens desta comanda:" },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content || "{}";
        const parsed = JSON.parse(content);
        const items = Array.isArray(parsed.items) ? parsed.items : [];

        return items.map((it: any) => ({
            name: String(it.name || "Item sem nome"),
            amountCents: Math.round(Number(it.amountCents || 0))
        }));
    }
}
