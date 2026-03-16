import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export class OpenAIService {
    /**
     * Transcreve áudio usando Whisper e retorna texto e metadados
     */
    static async transcribeAudio(file: File | Blob): Promise<{ text: string; model: string; durationSeconds: number }> {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY não configurada no servidor.");
        }

        const transcription = await openai.audio.transcriptions.create({
            file: file as any,
            model: "whisper-1",
            language: "pt",
            response_format: "verbose_json", // Para obter duração
        });

        return {
            text: transcription.text,
            model: "whisper-1",
            durationSeconds: (transcription as any).duration || 0
        };
    }

    /**
     * Extrai itens (nome e valor) de um texto usando GPT-4o-mini
     */
    static async parseItemsFromText(text: string): Promise<{ items: { name: string; amountCents: number }[], usage: any, model: string }> {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY não configurada no servidor.");
        }

        const model = "gpt-4o-mini";
        const response = await openai.chat.completions.create({
            model,
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
        const usage = response.usage;

        try {
            const parsed = JSON.parse(content);
            const items = Array.isArray(parsed.items) ? parsed.items : [];

            return {
                items: items.map((it: any) => ({
                    name: String(it.name || "Item sem nome"),
                    amountCents: Math.round(Number(it.amountCents || 0))
                })),
                usage,
                model
            };
        } catch (e) {
            console.error("[OpenAIService] JSON Parse Error:", e);
            return { items: [], usage, model };
        }
    }

    /**
     * Extrai nomes de pessoas de um texto transcrito
     */
    static async parseParticipantsFromText(text: string): Promise<{ names: string[]; usage: any, model: string }> {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY não configurada no servidor.");
        }

        const model = "gpt-4o-mini";
        const response = await openai.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: `Você é um assistente que extrai uma lista de nomes de pessoas de um texto transcrito.
Regras:
1. Retorne APENAS um JSON no formato: {"names": [string]}.
2. Se o texto contiver nomes próprios (ex: "João, Maria e Pedro"), retorne esses nomes: ["João", "Maria", "Pedro"].
3. Se o texto indicar uma quantidade de pessoas sem nomes específicos (ex: "estou eu e mais 5 pessoas", "somos 6", "tem 4 pessoas aqui"), gere nomes genéricos numerados: ["Pessoa 01", "Pessoa 02", ..., "Pessoa 06"].
4. "Eu" ou "comigo" conta como uma pessoa (Pessoa 01 ou o nome do falante se identificado).
5. Priorize os nomes reais se fornecidos. Se misto (ex: "Eu, João e mais 2"), retorne o nome real e gere genéricos para o restante: ["João", "Pessoa 02", "Pessoa 03", "Pessoa 04"].
6. Se não houver nenhuma indicação, retorne {"names": []}.`
                },
                {
                    role: "user",
                    content: text
                }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content || "{}";
        const usage = response.usage;
        const parsed = JSON.parse(content);
        return {
            names: Array.isArray(parsed.names) ? parsed.names : [],
            usage,
            model
        };
    }

    /**
     * Realiza OCR em uma imagem de comanda usando GPT-4o
     */
    static async parseItemsFromImage(base64Image: string): Promise<{ items: { name: string; amountCents: number }[], usage: any, model: string }> {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY não configurada no servidor.");
        }

        const model = "gpt-4o";
        const response = await openai.chat.completions.create({
            model,
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
        const usage = response.usage;
        const parsed = JSON.parse(content);
        const items = Array.isArray(parsed.items) ? parsed.items : [];

        return {
            items: items.map((it: any) => ({
                name: String(it.name || "Item sem nome"),
                amountCents: Math.round(Number(it.amountCents || 0))
            })),
            usage,
            model
        };
    }
}
