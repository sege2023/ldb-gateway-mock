/**
 * lib/rates.js
 *
 * Mock rate engine.
 *
 * In production this would call the OTC partner's API 
 * to get an executable quote, then apply the buffer in the negative direction:
 *   display_rate = otc_executable_rate / 1.015
 *
 * Here we use a hardcoded mock OTC rate. The buffer math is real.
 */

const OTC_MOCK_RATE_NGN_PER_USD = 1490; // mock OTC executable quote (NGN per USDT)
const MARGIN_FACTOR = 1.015;            // 1.5% margin

// Rate quoted to user. Lower than OTC rate so user pays more USDT.
// That extra USDT is ldbAfrica's margin.
const DISPLAY_RATE = OTC_MOCK_RATE_NGN_PER_USD / MARGIN_FACTOR; // ~1467.49

/**
 * Convert a NGN amount to USDT using the display (buffered) rate.
 * @param {number} amountNgn
 * @returns {number} amount in USDT rounded to 6 decimal places
 */
function convertNgnToUsdt(amountNgn) {
  return parseFloat((amountNgn / DISPLAY_RATE).toFixed(6));
}

/**
 * Compute USD equivalent of a USDT amount.
 * In production: use 24hr VWAP from Binance. Here USDT = $1.00.
 * @param {number} amountUsdt
 * @returns {number}
 */
function usdtToUsd(amountUsdt) {
  return parseFloat(amountUsdt.toFixed(6));
}

module.exports = {
  OTC_MOCK_RATE_NGN_PER_USD,
  DISPLAY_RATE,
  convertNgnToUsdt,
  usdtToUsd,
};
