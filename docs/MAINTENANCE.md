# Manutenção / Lembretes

## Limpezas pendentes (pós-debug)

### `authMiddleware` está retornando detalhes sensíveis em 401
- **Arquivo**: `src/middleware/auth.ts`
- **Estado atual**: em caso de falha de auth, a API retorna para o client:
  - `stack`
  - `hasSecret`
  - `keyPrefix`
- **Motivo**: isso foi útil para depurar problemas intermitentes em dispositivos (iOS) e ambientes (serverless).
- **Ação recomendada**: remover esse payload detalhado antes de considerar “final” para produção.
  - Manter apenas uma mensagem genérica (`401 Unauthorized`) e logar detalhes somente no server.

### Correlation ID / `x-request-id`
- **Arquivos**:
  - `src/index.ts` (ecoar/gerar `x-request-id`)
  - `rateio-web/src/api/client.ts` (gerar `x-request-id` no client)
- **Status**: pode permanecer em produção (baixo risco, alto valor para troubleshooting).

