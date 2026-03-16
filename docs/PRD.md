# Rateio Justo — Documento de Produto (PROD)

## 1. O que é
Rateio Justo é um webapp mobile-first para dividir contas de forma justa, item a item, entre pessoas — começando por bar e restaurante.

Ele resolve o momento em que a conta chega, cada pessoa consumiu coisas diferentes, há taxas extras, e ninguém quer perder tempo nem discutir.

---

## 2. Problema
Dividir conta em grupo é ruim porque:
- cada pessoa consumiu valores diferentes
- existem taxas (serviço, couvert, extras)
- o contexto é caótico (barulho, pressa, mesa cheia)
- normalmente vira planilha, calculadora ou discussão

O problema não é matemático, é situacional.

---

## 3. Público-alvo do MVP
- Grupos de 2 a 20 pessoas
- Bar/restaurante
- Conta já fechada
- Um usuário (criador) faz o rateio pelo celular

Fora do MVP:
- viagens
- churrascos
- eventos longos
- caixa compartilhado avançado

---

## 4. Proposta de valor
- Justiça: cada pessoa paga apenas o que consumiu
- Rapidez: rateio resolvido em minutos
- Clareza: cálculo transparente e auditável

---

## 5. Fluxo do MVP (Onboarding V2)
1. **Participantes**: Criar ou acessar rateio e adicionar quem está na mesa (suporte a geolocalização para o nome do rateio).
2. **Itens**: Inserir consumos:
   - Manual: Digitação rápida.
   - **Scan (OCR)**: Captura de foto da conta/comanda.
   - **Voz**: Narrar o que foi consumido.
   - Colar Texto: Parser inteligente para textos de apps de delivery ou notas.
3. **Revisão**: Validar cálculos e desbloquear valores via PIX.
4. **Recibo**: Link público para conferência.

---

## 6. Identidade e Acesso
- **Identidade Persistente**: Usuários sem conta (guests) possuem um ID único salvo no navegador que garante a posse dos rateios criados.
- **Login Opcional**: Clerk para usuários que desejam histórico unificado em múltiplos dispositivos.

---

## 7. Monetização
- Taxa base fixa por rateio
- Custo adicional apenas se usar IA
- Top-up opcional de créditos para uso futuro

Sem assinatura no MVP.

---

## 7. Wallet (créditos)
- Créditos vinculados ao usuário
- Usados automaticamente em próximos rateios
- Sem saque ou transferência (MVP)

---

## 8. Regras fundamentais
- Apenas o criador edita o rateio
- Link público só existe após pagamento
- Preços vêm do backend
- Preço do rateio é congelado na revisão
- Valores nunca são recalculados depois

---

## 9. Definição de sucesso do MVP
- Uso real em bares/restaurantes
- Rateio concluído rapidamente
- Pagamento sem resistência
- Redução de atrito social percebida

---

## 10. Próximo passo
Usar este PROD.md junto com SPECS.md no Google Antigravity para gerar o código do MVP.
