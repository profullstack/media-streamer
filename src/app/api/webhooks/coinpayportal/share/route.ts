/**
 * Former per-kind CoinPay webhook (/api/webhooks/coinpayportal/share).
 *
 * CoinPay delivers every event for the business to its ONE webhook_url
 * (/api/webhooks/coinpayportal), so this address never received deliveries.
 * It stays as a thin forward to that route, which verifies the signature and
 * dispatches pass payments on metadata.type (src/lib/coinpayportal/grant-webhooks.ts),
 * in case anything still posts here.
 *
 * @route POST /api/webhooks/coinpayportal/share
 * @route GET  /api/webhooks/coinpayportal/share
 */

export { POST, GET } from '../route';
