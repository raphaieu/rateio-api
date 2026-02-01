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

## 5. Fluxo do MVP
1. Criar rateio (nome opcional + número de pessoas)
2. Editar nomes dos participantes (apenas o criador)
3. Inserir itens:
   - Manual (item + valor + consumidores)
   - Colar texto (parser local + IA opcional com custo exibido antes)
4. Informar taxas/extras (serviço %, couvert, extras)
5. Revisão (mostra total geral, bloqueia valores por pessoa)
6. Pagamento via PIX (taxa base + custo variável se IA)
7. Resultado final + link público read-only

---

## 6. Monetização
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
