# Manutenção / Lembretes

## Limpezas pendentes (pós-debug)

### `authMiddleware` está retornando detalhes sensíveis em 401
- **Estado**: ✅ Resolvido (src/middleware/auth.ts agora retorna apenas mensagem genérica).

### Correlation ID / `x-request-id`
- **Arquivos**:
  - `src/index.ts` (ecoar/gerar `x-request-id`)
  - `rateio-web/src/api/client.ts` (gerar `x-request-id` no client)
- **Status**: pode permanecer em produção (baixo risco, alto valor para troubleshooting).

