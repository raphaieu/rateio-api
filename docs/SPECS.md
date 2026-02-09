# Rateio Justo — SPECS (API)

## 0. Objetivo
Fornecer uma API simples e segura para suportar o MVP do Rateio Justo:
- persistência de rateios (incluindo geolocalização opcional para nome do rateio)
- cálculo determinístico
- paywall via PIX
- wallet de créditos
- link público read-only
- geo: reverse geocoding e busca de lugares para definir nome do rateio (Google Places/Geocoding; fallback Nominatim)

---

## 1. Stack
- Runtime: Node.js (Vercel Functions)
- ORM: Drizzle
- Banco: Turso (SQLite)
- Auth: Clerk (JWT)
- Pagamento: Mercado Pago (PIX)
- Deploy: Vercel

---

## 2. Regras de segurança
- Toda edição exige Clerk JWT válido
- Apenas owner pode editar o split
- Link público só retorna dados se split = PAID
- Preços nunca vêm do client

---

## 3. Estados do Split
- DRAFT
- PAID

---

## 4. Modelo de Dados (SQLite)

### splits
- id (pk)
- owner_clerk_user_id
- name
- status
- receipt_image_url
- latitude, longitude (opcional; geolocalização do estabelecimento)
- place_provider, place_id, place_name, place_display_name (opcional; metadados do lugar)
- public_slug
- created_at
- updated_at

### participants
- id (pk)
- split_id
- name
- sort_order

### items
- id (pk)
- split_id
- name
- amount_cents

### item_shares
- item_id
- participant_id

### extras
- id
- split_id
- type (SERVICE_PERCENT | FIXED)
- value_cents
- value_percent_bp
- allocation_mode (PROPORTIONAL | EQUAL)

### split_costs
- split_id (pk)
- base_fee_cents
- ai_cents
- total_cents
- created_at

### wallets
- owner_clerk_user_id (pk)
- balance_cents

### wallet_ledger
- id
- owner_clerk_user_id
- type (TOPUP | CHARGE)
- amount_cents
- ref_type
- ref_id
- created_at

### payments
- id
- owner_clerk_user_id
- split_id
- status
- amount_cents_total
- amount_cents_split_cost
- amount_cents_topup
- provider_payment_id
- qr_code
- qr_copy_paste
- created_at
- updated_at

---

## 5. Pricing (.env)
- BASE_FEE_CENTS
- AI_TEXT_TIER_1_MAX_CHARS / AI_TEXT_TIER_1_CENTS
- AI_TEXT_TIER_2_MAX_CHARS / AI_TEXT_TIER_2_CENTS
- AI_TEXT_TIER_3_MAX_CHARS / AI_TEXT_TIER_3_CENTS

---

## 6. Cálculo do rateio
- Items divididos igualmente entre consumidores
- Extras:
  - PROPORTIONAL: baseado no consumo
  - EQUAL: dividido por pessoa
- Soma final deve fechar exatamente o total (controle de centavos)

---

## 7. Endpoints principais

### Pricing
- GET /pricing/current

### Splits
- POST /splits
- GET /splits/:id
- PATCH /splits/:id (nome e campos de geolocalização: latitude, longitude, placeProvider, placeId, placeName, placeDisplayName)

### Geo (auth obrigatório)
- GET /geo/reverse?lat=&lng= — reverse geocoding; retorna sugestão de nome do lugar (preferência: Google Places/Geocoding).
- GET /geo/search?q=&limit=&lat=&lng= — busca de lugares por texto; opcional lat/lng para priorizar resultados próximos (preferência: Google Places).

### Participants / Items / Extras
- PUT /splits/:id/participants
- PUT /splits/:id/items
- PUT /splits/:id/extras

### Parsing
- POST /splits/:id/ai-parse

### Review
- POST /splits/:id/compute-review

### Payment
- POST /splits/:id/pay
- POST /webhooks/mercadopago

### Public
- GET /public/:slug

---

## 8. Pagamento PIX
- Criação de cobrança via Mercado Pago
- Webhook confirma pagamento
- Atualiza wallet, ledger e split.status
- Gera public_slug

---

## 9. Variáveis de ambiente
- TURSO_DATABASE_URL
- TURSO_AUTH_TOKEN
- CLERK_JWT_PUBLIC_KEY
- MERCADO_PAGO_ACCESS_TOKEN
- MERCADO_PAGO_WEBHOOK_SECRET
- BASE_FEE_CENTS
- AI_TEXT_TIER_* (tiers)
- GOOGLE_MAPS_API_KEY (opcional; se setada, usa Google Places/Geocoding em `/geo/*`)
- NOMINATIM_BASE_URL (opcional; default https://nominatim.openstreetmap.org)
- NOMINATIM_USER_AGENT (opcional; para respeito à política de uso do Nominatim)
