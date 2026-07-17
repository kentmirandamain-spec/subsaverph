/**
 * Multi-currency engine for SubSaverPH
 * Prices in USD → converted to selected currency
 * Live rates: open.er-api.com · offline fallback included
 */

const CURRENCY_KEY = "subsaverph_currency_v2";
const RATES_KEY = "subsaverph_rates_v2";

export const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "INR", name: "Indian Rupee" },
  { code: "KRW", name: "South Korean Won" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "ZAR", name: "South African Rand" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "RUB", name: "Russian Ruble" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "ILS", name: "Israeli Shekel" },
  { code: "THB", name: "Thai Baht" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "VND", name: "Vietnamese Dong" },
  { code: "TWD", name: "Taiwan Dollar" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "HUF", name: "Hungarian Forint" },
  { code: "RON", name: "Romanian Leu" },
  { code: "BGN", name: "Bulgarian Lev" },
  { code: "UAH", name: "Ukrainian Hryvnia" },
  { code: "EGP", name: "Egyptian Pound" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "KES", name: "Kenyan Shilling" },
  { code: "GHS", name: "Ghanaian Cedi" },
  { code: "MAD", name: "Moroccan Dirham" },
  { code: "ARS", name: "Argentine Peso" },
  { code: "CLP", name: "Chilean Peso" },
  { code: "COP", name: "Colombian Peso" },
  { code: "PEN", name: "Peruvian Sol" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "BDT", name: "Bangladeshi Taka" },
  { code: "LKR", name: "Sri Lankan Rupee" },
  { code: "NPR", name: "Nepalese Rupee" },
  { code: "QAR", name: "Qatari Riyal" },
  { code: "KWD", name: "Kuwaiti Dinar" },
  { code: "BHD", name: "Bahraini Dinar" },
  { code: "OMR", name: "Omani Rial" },
  { code: "JOD", name: "Jordanian Dinar" },
  { code: "IQD", name: "Iraqi Dinar" },
  { code: "ISK", name: "Icelandic Krona" },
  { code: "HRK", name: "Croatian Kuna" },
  { code: "RSD", name: "Serbian Dinar" },
  { code: "GEL", name: "Georgian Lari" },
  { code: "AMD", name: "Armenian Dram" },
  { code: "AZN", name: "Azerbaijani Manat" },
  { code: "KZT", name: "Kazakhstani Tenge" },
  { code: "UZS", name: "Uzbekistani Som" },
  { code: "MNT", name: "Mongolian Tugrik" },
  { code: "KHR", name: "Cambodian Riel" },
  { code: "LAK", name: "Lao Kip" },
  { code: "MMK", name: "Myanmar Kyat" },
  { code: "BND", name: "Brunei Dollar" },
  { code: "FJD", name: "Fijian Dollar" },
  { code: "XOF", name: "West African CFA" },
  { code: "XAF", name: "Central African CFA" },
  { code: "XCD", name: "East Caribbean Dollar" },
  { code: "JMD", name: "Jamaican Dollar" },
  { code: "TTD", name: "Trinidad & Tobago Dollar" },
  { code: "DOP", name: "Dominican Peso" },
  { code: "GTQ", name: "Guatemalan Quetzal" },
  { code: "HNL", name: "Honduran Lempira" },
  { code: "NIO", name: "Nicaraguan Córdoba" },
  { code: "CRC", name: "Costa Rican Colón" },
  { code: "PAB", name: "Panamanian Balboa" },
  { code: "UYU", name: "Uruguayan Peso" },
  { code: "PYG", name: "Paraguayan Guarani" },
  { code: "BOB", name: "Bolivian Boliviano" },
  { code: "DZD", name: "Algerian Dinar" },
  { code: "TND", name: "Tunisian Dinar" },
  { code: "ETB", name: "Ethiopian Birr" },
  { code: "UGX", name: "Ugandan Shilling" },
  { code: "TZS", name: "Tanzanian Shilling" },
  { code: "RWF", name: "Rwandan Franc" },
  { code: "MUR", name: "Mauritian Rupee" },
  { code: "MZN", name: "Mozambican Metical" },
  { code: "AOA", name: "Angolan Kwanza" },
  { code: "ZMW", name: "Zambian Kwacha" },
  { code: "BWP", name: "Botswana Pula" },
  { code: "NAD", name: "Namibian Dollar" },
  { code: "MOP", name: "Macanese Pataca" },
  { code: "AFN", name: "Afghan Afghani" },
  { code: "BYN", name: "Belarusian Ruble" },
  { code: "MDL", name: "Moldovan Leu" },
  { code: "ALL", name: "Albanian Lek" },
  { code: "MKD", name: "Macedonian Denar" },
  { code: "BAM", name: "Bosnia-Herzegovina Mark" },
  { code: "XDR", name: "IMF SDR" },
  { code: "XPF", name: "CFP Franc" },
  { code: "LBP", name: "Lebanese Pound" },
  { code: "YER", name: "Yemeni Rial" },
  { code: "SYP", name: "Syrian Pound" },
  { code: "IRR", name: "Iranian Rial" },
  { code: "BTN", name: "Bhutanese Ngultrum" },
  { code: "MVR", name: "Maldivian Rufiyaa" },
  { code: "KGS", name: "Kyrgyzstani Som" },
  { code: "TJS", name: "Tajikistani Somoni" },
  { code: "TMT", name: "Turkmenistani Manat" },
  { code: "GIP", name: "Gibraltar Pound" },
  { code: "CVE", name: "Cape Verdean Escudo" },
  { code: "GMD", name: "Gambian Dalasi" },
  { code: "GNF", name: "Guinean Franc" },
  { code: "SLL", name: "Sierra Leonean Leone" },
  { code: "LRD", name: "Liberian Dollar" },
  { code: "SOS", name: "Somali Shilling" },
  { code: "DJF", name: "Djiboutian Franc" },
  { code: "ERN", name: "Eritrean Nakfa" },
  { code: "SSP", name: "South Sudanese Pound" },
  { code: "MWK", name: "Malawian Kwacha" },
  { code: "SZL", name: "Swazi Lilangeni" },
  { code: "LSL", name: "Lesotho Loti" },
  { code: "BIF", name: "Burundian Franc" },
  { code: "KMF", name: "Comorian Franc" },
  { code: "MRU", name: "Mauritanian Ouguiya" },
  { code: "SCR", name: "Seychellois Rupee" },
  { code: "MGA", name: "Malagasy Ariary" },
  { code: "CDF", name: "Congolese Franc" },
  { code: "ZWL", name: "Zimbabwean Dollar" },
  { code: "BBD", name: "Barbadian Dollar" },
  { code: "BMD", name: "Bermudian Dollar" },
  { code: "BSD", name: "Bahamian Dollar" },
  { code: "KYD", name: "Cayman Islands Dollar" },
  { code: "AWG", name: "Aruban Florin" },
  { code: "ANG", name: "Netherlands Antillean Guilder" },
  { code: "GYD", name: "Guyanese Dollar" },
  { code: "SRD", name: "Surinamese Dollar" },
  { code: "HTG", name: "Haitian Gourde" },
  { code: "CUP", name: "Cuban Peso" },
  { code: "VES", name: "Venezuelan Bolívar" },
  { code: "PGK", name: "Papua New Guinean Kina" },
  { code: "WST", name: "Samoan Tala" },
  { code: "TOP", name: "Tongan Paʻanga" },
  { code: "SBD", name: "Solomon Islands Dollar" },
  { code: "VUV", name: "Vanuatu Vatu" },
  { code: "STN", name: "São Tomé Dobra" },
  { code: "SLE", name: "Sierra Leone Leone" },
];

const seen = new Set();
export const CURRENCY_LIST = CURRENCIES.filter((c) => {
  if (seen.has(c.code)) return false;
  seen.add(c.code);
  return true;
}).sort((a, b) => a.code.localeCompare(b.code));

const FALLBACK_RATES = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CNY: 7.24, AUD: 1.53, CAD: 1.36,
  CHF: 0.88, HKD: 7.82, SGD: 1.34, PHP: 56.5, INR: 83.1, KRW: 1320, BRL: 4.97,
  MXN: 17.1, ZAR: 18.6, SEK: 10.5, NOK: 10.7, DKK: 6.9, NZD: 1.66, PLN: 3.95,
  TRY: 32.2, RUB: 92.5, AED: 3.67, SAR: 3.75, ILS: 3.7, THB: 35.5, MYR: 4.7,
  IDR: 15700, VND: 24500, TWD: 31.5, CZK: 23.2, HUF: 360, RON: 4.57, BGN: 1.8,
  UAH: 39.5, EGP: 47.5, NGN: 1550, KES: 153, GHS: 14.5, MAD: 10.1, ARS: 870,
  CLP: 950, COP: 3950, PEN: 3.75, PKR: 278, BDT: 110, LKR: 310, NPR: 133,
  QAR: 3.64, KWD: 0.31, BHD: 0.377, OMR: 0.385, JOD: 0.709, IQD: 1310,
  ISK: 138, XOF: 605, XAF: 605, XCD: 2.7, XPF: 110, XDR: 0.75, MOP: 8.05,
};

let rates = { ...FALLBACK_RATES };
let currentCode = localStorage.getItem(CURRENCY_KEY) || "PHP";
let ratesSource = "fallback";

export function getCurrencyCode() {
  return currentCode;
}

export function setCurrency(code) {
  if (!code) return;
  currentCode = String(code).toUpperCase();
  localStorage.setItem(CURRENCY_KEY, currentCode);
  window.dispatchEvent(new CustomEvent("currency:change", { detail: { code: currentCode } }));
}

function rateOf(code) {
  return rates[code] ?? FALLBACK_RATES[code] ?? 1;
}

/** Convert amount from fromCode into current display currency numeric value */
export function convertAmount(amount, fromCode = "USD") {
  const from = String(fromCode || "USD").toUpperCase();
  const usd = from === "USD" ? Number(amount) : Number(amount) / rateOf(from);
  return usd * rateOf(currentCode);
}

/** Convert any currency amount to USD */
export function toUsd(amount, fromCode = "USD") {
  const from = String(fromCode || "USD").toUpperCase();
  if (from === "USD") return Number(amount);
  return Number(amount) / rateOf(from);
}

function formatValue(value) {
  const zeroDec = ["JPY", "KRW", "VND", "CLP", "ISK", "PYG", "UGX", "XOF", "XAF", "XPF", "IDR", "HUF"].includes(currentCode);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currentCode,
      maximumFractionDigits: zeroDec ? 0 : 2,
      minimumFractionDigits: zeroDec ? 0 : 2,
    }).format(value);
  } catch {
    return `${currentCode} ${zeroDec ? Math.round(value) : value.toFixed(2)}`;
  }
}

/** Format USD amount in active currency */
export function formatMoney(usdAmount) {
  return formatValue(Number(usdAmount) * rateOf(currentCode));
}

/** Format amount stored in fromCode (e.g. PHP 99 → active currency) */
export function formatAmount(amount, fromCode = "USD") {
  return formatValue(convertAmount(amount, fromCode));
}

export function getRatesInfo() {
  return { source: ratesSource, code: currentCode, count: Object.keys(rates).length };
}

export async function loadRates() {
  try {
    const cached = JSON.parse(localStorage.getItem(RATES_KEY) || "null");
    if (cached?.rates && cached.ts && Date.now() - cached.ts < 6 * 60 * 60 * 1000) {
      rates = { USD: 1, ...cached.rates };
      ratesSource = "cache";
      return getRatesInfo();
    }
  } catch {
    /* ignore */
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error("fail");
    const data = await res.json();
    if (data?.result === "success" && data.rates) {
      rates = { USD: 1, ...data.rates };
      for (const c of CURRENCY_LIST) {
        if (rates[c.code] == null && FALLBACK_RATES[c.code] != null) {
          rates[c.code] = FALLBACK_RATES[c.code];
        }
      }
      ratesSource = "live";
      localStorage.setItem(RATES_KEY, JSON.stringify({ rates: data.rates, ts: Date.now() }));
      window.dispatchEvent(new CustomEvent("rates:loaded"));
      return getRatesInfo();
    }
    throw new Error("bad");
  } catch {
    rates = { ...FALLBACK_RATES };
    ratesSource = "fallback";
    return getRatesInfo();
  }
}

export function populateCurrencySelect(selectEl, { showName = true } = {}) {
  if (!selectEl) return;
  const prev = selectEl.value || currentCode;
  selectEl.innerHTML = CURRENCY_LIST.map((c) => {
    const label = showName ? `${c.code} — ${c.name}` : c.code;
    return `<option value="${c.code}">${label}</option>`;
  }).join("");
  selectEl.value = CURRENCY_LIST.some((c) => c.code === prev) ? prev : currentCode;
}

/**
 * Mount searchable currency picker into a container.
 * container needs structure: .currency-picker with [data-fx-search], [data-fx-list], [data-fx-btn], [data-fx-label]
 */
export function mountCurrencyPicker(container, { onChange } = {}) {
  if (!container) return;
  // Allow remount on checkout page re-render: only skip if same instance already live
  if (container.dataset.mounted === "1" && container._fxClose) {
    // Still sync label for current currency
    const label = container.querySelector("[data-fx-label]");
    if (label) label.textContent = currentCode;
    return;
  }
  container.dataset.mounted = "1";

  const btn = container.querySelector("[data-fx-btn]");
  const label = container.querySelector("[data-fx-label]");
  const panel = container.querySelector("[data-fx-panel]");
  const search = container.querySelector("[data-fx-search]");
  const list = container.querySelector("[data-fx-list]");
  if (!btn || !panel || !list) return;

  function meta(code) {
    return CURRENCY_LIST.find((c) => c.code === code) || { code, name: code };
  }

  function syncLabel() {
    const m = meta(currentCode);
    if (label) label.textContent = `${m.code}`;
    if (btn) btn.setAttribute("aria-label", `Currency ${m.code} — ${m.name}`);
  }

  function renderList(q = "") {
    const query = q.trim().toLowerCase();
    const filtered = CURRENCY_LIST.filter(
      (c) =>
        !query ||
        c.code.toLowerCase().includes(query) ||
        c.name.toLowerCase().includes(query)
    );
    list.innerHTML = filtered.length
      ? filtered
          .map(
            (c) => `
        <button type="button" class="fx-option ${c.code === currentCode ? "active" : ""}" data-code="${c.code}">
          <strong>${c.code}</strong>
          <span>${c.name}</span>
        </button>`
          )
          .join("")
      : `<div class="fx-empty">No currency match</div>`;
  }

  function open() {
    // Close prefs if open
    const prefs = document.getElementById("prefsPanel");
    if (prefs) prefs.hidden = true;
    document.getElementById("prefsPicker")?.classList.remove("open");
    // Close other currency pickers
    document.querySelectorAll(".currency-picker.open").forEach((el) => {
      if (el !== container) {
        el.classList.remove("open");
        const p = el.querySelector("[data-fx-panel]");
        if (p) p.hidden = true;
      }
    });
    panel.hidden = false;
    container.classList.add("open");
    renderList(search?.value || "");
    setTimeout(() => search?.focus(), 10);
  }

  function close() {
    panel.hidden = true;
    container.classList.remove("open");
  }
  container._fxClose = close;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (container.classList.contains("open")) close();
    else open();
  });

  panel.addEventListener("click", (e) => e.stopPropagation());

  search?.addEventListener("input", () => renderList(search.value));
  search?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Enter") {
      e.preventDefault();
      const first = list.querySelector("[data-code]");
      if (first) {
        setCurrency(first.dataset.code);
        syncLabel();
        close();
        onChange?.(currentCode);
      }
    }
  });

  list.addEventListener("click", (e) => {
    const opt = e.target.closest("[data-code]");
    if (!opt) return;
    e.preventDefault();
    e.stopPropagation();
    setCurrency(opt.dataset.code);
    syncLabel();
    close();
    onChange?.(currentCode);
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) close();
  });

  window.addEventListener("currency:change", syncLabel);

  syncLabel();
  renderList();
  close();
}

export function currencyPickerHTML(idPrefix = "nav") {
  return `
    <div class="currency-picker" id="${idPrefix}CurrencyPicker">
      <button type="button" class="fx-btn" data-fx-btn>
        <span class="fx-caption">Pay</span>
        <span data-fx-label>PHP</span>
        <span class="fx-chevron">▾</span>
      </button>
      <div class="fx-panel" data-fx-panel hidden>
        <div class="fx-search-wrap">
          <input type="search" data-fx-search placeholder="Search currency (USD, peso, euro…)" autocomplete="off" />
        </div>
        <div class="fx-list" data-fx-list></div>
      </div>
    </div>`;
}
