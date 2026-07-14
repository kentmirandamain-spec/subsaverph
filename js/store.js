import { formatMoney as fxUsd, formatAmount, toUsd } from "./currency.js";

const CART_KEY = "subsaverph_cart_v3";
const ORDERS_KEY = "subsaverph_orders_v3";

export function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent("cart:change", { detail: cart }));
}

export function addDeal(deal, qty = 1) {
  const cart = getCart();
  const existing = cart.find((i) => i.id === deal.id);
  if (existing) existing.qty = Math.min(existing.qty + qty, 5);
  else {
    cart.push({
      id: deal.id,
      name: deal.name,
      brand: deal.brand,
      monogram: deal.monogram,
      price: deal.price,
      original: deal.original,
      priceBase: deal.priceBase || "USD",
      period: deal.period,
      duration: deal.duration,
      qty: Math.min(qty, 5),
    });
  }
  saveCart(cart);
  return cart;
}

export function setQty(id, qty) {
  saveCart(
    getCart()
      .map((i) => (i.id === id ? { ...i, qty } : i))
      .filter((i) => i.qty > 0)
  );
}

export function removeItem(id) {
  saveCart(getCart().filter((i) => i.id !== id));
}

export function clearCart() {
  saveCart([]);
}

export function cartCount() {
  return getCart().reduce((n, i) => n + i.qty, 0);
}

/** Totals in USD (for consistent math across mixed bases) */
export function cartTotals() {
  const cart = getCart();
  let subtotal = 0;
  let was = 0;
  for (const i of cart) {
    const base = i.priceBase || "USD";
    subtotal += toUsd(i.price * i.qty, base);
    was += toUsd(i.original * i.qty, base);
  }
  return { subtotal, was, saved: Math.max(0, was - subtotal), total: subtotal };
}

/** Format USD amount (legacy / cart totals) */
export function formatMoney(usd) {
  return fxUsd(usd);
}

/** Format a deal field using its priceBase (PHP for SuperGrok) */
export function formatDealPrice(deal, field = "price") {
  return formatAmount(deal[field], deal.priceBase || "USD");
}

/** Format cart line using stored priceBase */
export function formatLinePrice(item, unit = false) {
  const amount = unit ? item.price : item.price * item.qty;
  return formatAmount(amount, item.priceBase || "USD");
}

export function saveOrder(order) {
  const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
  orders.unshift(order);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export function pctOff(price, original) {
  if (!original || original <= price) return 0;
  return Math.round((1 - price / original) * 100);
}
