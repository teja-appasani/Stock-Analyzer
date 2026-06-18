const API_BASE = "https://www.alphavantage.co/query";
const API_KEY = "RCUURZLF49AFSALE";

const CACHE_TIME = 60 * 60 * 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function num(value) {
  if (value === undefined || value === null || value === "None" || value === "-" || value === "") {
    return null;
  }

  const n = Number(value);
  return isNaN(n) ? null : n;
}

function safeDivide(a, b) {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

function fmt(value) {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function money(value) {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  return "$" + Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function formatLargeNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return "N/A";

  const abs = Math.abs(value);

  if (abs >= 1e12) {
    return "$" + (value / 1e12).toFixed(2) + " T";
  }

  if (abs >= 1e9) {
    return "$" + (value / 1e9).toFixed(2) + " B";
  }

  if (abs >= 1e6) {
    return "$" + (value / 1e6).toFixed(2) + " M";
  }

  if (abs >= 1e3) {
    return "$" + (value / 1e3).toFixed(2) + " K";
  }

  return "$" + value.toFixed(2);
}

function pct(value) {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  return (value * 100).toFixed(2) + "%";
}

async function fetchAV(functionName, ticker) {
  const url =
    `${API_BASE}?function=${functionName}&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(API_KEY)}`;

  const response = await fetch(url);
  const data = await response.json();

  console.log(functionName, data);

  if (data.Note) {
    throw new Error("Alpha Vantage rate limit reached. Wait and try again.");
  }

  if (data.Information) {
    throw new Error(data.Information);
  }

  if (data["Error Message"]) {
    throw new Error(data["Error Message"]);
  }

  return data;
}

async function loadStock() {
  const ticker = document.getElementById("ticker").value.trim().toUpperCase();
  const status = document.getElementById("status");

  if (!ticker) {
    status.textContent = "Please enter a ticker symbol.";
    return;
  }

  if (API_KEY === "PASTE_YOUR_ALPHA_VANTAGE_KEY_HERE") {
    status.textContent = "Please paste your Alpha Vantage API key inside app.js first.";
    return;
  }

  try {
    status.textContent = "Fetching financial data...";

    const cachedRaw = localStorage.getItem("stock_cache_" + ticker);

    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      const isFresh = Date.now() - cached.savedAt < CACHE_TIME;

      if (isFresh) {
        localStorage.setItem("ticker", ticker);
        localStorage.setItem("stock_data", JSON.stringify(cached.data));
        renderOverview(cached.data);
        status.textContent = "Loaded cached data. Analysis complete.";
        return;
      }
    }

    const overview = await fetchAV("OVERVIEW", ticker);
    await sleep(1200);

    const income = await fetchAV("INCOME_STATEMENT", ticker);
    await sleep(1200);

    const balance = await fetchAV("BALANCE_SHEET", ticker);
    await sleep(1200);

    const cash = await fetchAV("CASH_FLOW", ticker);
    await sleep(1200);

    const prices = await fetchAV("TIME_SERIES_DAILY", ticker);

    if (!overview.Symbol) {
      throw new Error("No company overview found. Check the ticker.");
    }

    const data = {
      overview,
      income,
      balance,
      cash,
      prices
    };

    localStorage.setItem("ticker", ticker);
    localStorage.setItem("stock_data", JSON.stringify(data));

    localStorage.setItem(
      "stock_cache_" + ticker,
      JSON.stringify({
        savedAt: Date.now(),
        data
      })
    );

    renderOverview(data);
    status.textContent = "Analysis complete.";
  } catch (err) {
    console.error(err);
    status.textContent = "Error: " + err.message;
  }
}

function getData() {
  const raw = localStorage.getItem("stock_data");
  return raw ? JSON.parse(raw) : null;
}

function latestReports(data) {
  return {
    income0: data.income.annualReports?.[0],
    income1: data.income.annualReports?.[1],
    balance0: data.balance.annualReports?.[0],
    balance1: data.balance.annualReports?.[1],
    cash0: data.cash.annualReports?.[0]
  };
}

function calculateMetrics(data) {
  const { income0, income1, balance0, balance1, cash0 } = latestReports(data);

  const netIncome = num(income0?.netIncome);
  const totalAssets = num(balance0?.totalAssets);

  const currentAssets = num(balance0?.totalCurrentAssets);
  const currentLiabilities = num(balance0?.totalCurrentLiabilities);

  const totalLiabilities = num(balance0?.totalLiabilities);

  const revenue = num(income0?.totalRevenue);
  const prevRevenue = num(income1?.totalRevenue);

  const grossProfit = num(income0?.grossProfit);
  const prevGrossProfit = num(income1?.grossProfit);

  const operatingCashFlow = num(cash0?.operatingCashflow);

  const longTermDebt = num(balance0?.longTermDebt);
  const prevLongTermDebt = num(balance1?.longTermDebt);

  const prevCurrentAssets = num(balance1?.totalCurrentAssets);
  const prevCurrentLiabilities = num(balance1?.totalCurrentLiabilities);

  const prevAssets = num(balance1?.totalAssets);

  const intangibleAssets = num(balance0?.intangibleAssets) || 0;
  const retainedEarnings = num(balance0?.retainedEarnings);
  const ebit = num(income0?.ebit);

  const sharesOverview = num(data.overview.SharesOutstanding);
  const sharesBalance = num(balance0?.commonStockSharesOutstanding);
  const sharesPrevBalance = num(balance1?.commonStockSharesOutstanding);

  const shares = sharesOverview || sharesBalance;

  const marketCap = num(data.overview.MarketCapitalization);
  const price = safeDivide(marketCap, shares);

  const roa = safeDivide(netIncome, totalAssets);

  const currentRatio = safeDivide(currentAssets, currentLiabilities);
  const prevCurrentRatio = safeDivide(prevCurrentAssets, prevCurrentLiabilities);

  const grossMargin = safeDivide(grossProfit, revenue);
  const prevGrossMargin = safeDivide(prevGrossProfit, prevRevenue);

  const assetTurnover = safeDivide(revenue, totalAssets);
  const prevAssetTurnover = safeDivide(prevRevenue, prevAssets);

  const bookValuePerShare = safeDivide(
    totalAssets - intangibleAssets - totalLiabilities,
    shares
  );

  const pbRatio = safeDivide(price, bookValuePerShare);

  const workingCapital =
    currentAssets !== null && currentLiabilities !== null
      ? currentAssets - currentLiabilities
      : null;

  let altman = null;

  if (
    workingCapital !== null &&
    totalAssets !== null &&
    retainedEarnings !== null &&
    ebit !== null &&
    marketCap !== null &&
    totalLiabilities !== null &&
    revenue !== null
  ) {
    altman =
      1.2 * safeDivide(workingCapital, totalAssets) +
      1.4 * safeDivide(retainedEarnings, totalAssets) +
      3.3 * safeDivide(ebit, totalAssets) +
      0.6 * safeDivide(marketCap, totalLiabilities) +
      1.0 * safeDivide(revenue, totalAssets);
  }

  return {
    netIncome,
    totalAssets,
    currentAssets,
    currentLiabilities,
    totalLiabilities,
    revenue,
    grossProfit,
    operatingCashFlow,
    roa,
    currentRatio,
    grossMargin,
    prevCurrentRatio,
    prevGrossMargin,
    longTermDebt,
    prevLongTermDebt,
    assetTurnover,
    prevAssetTurnover,
    bookValuePerShare,
    pbRatio,
    altman,
    workingCapital,
    retainedEarnings,
    ebit,
    marketCap,
    price,
    shares,
    sharesBalance,
    sharesPrevBalance
  };
}

function calculatePiotroski(data) {
  const m = calculateMetrics(data);

  const checks = [
    {
      name: "Positive net income",
      passed: m.netIncome > 0
    },
    {
      name: "Positive ROA",
      passed: m.roa > 0
    },
    {
      name: "Positive operating cash flow",
      passed: m.operatingCashFlow > 0
    },
    {
      name: "Operating cash flow > net income",
      passed: m.operatingCashFlow > m.netIncome
    },
    {
      name: "Long-term debt decreased",
      passed: m.longTermDebt < m.prevLongTermDebt
    },
    {
      name: "Current ratio improved",
      passed: m.currentRatio > m.prevCurrentRatio
    },
    {
      name: "No new shares issued",
      passed:
        m.sharesBalance !== null &&
        m.sharesPrevBalance !== null &&
        m.sharesBalance <= m.sharesPrevBalance
    },
    {
      name: "Gross margin improved",
      passed: m.grossMargin > m.prevGrossMargin
    },
    {
      name: "Asset turnover improved",
      passed: m.assetTurnover > m.prevAssetTurnover
    }
  ];

  const score = checks.filter(check => check.passed).length;

  return {
    score,
    checks
  };
}

function getRecommendation(piotroskiScore, altmanScore, roa, grossMargin) {
  if (piotroskiScore >= 8 && altmanScore > 3 && roa > 0.08) {
    return {
      action: "STRONG BUY",
      cssClass: "good",
      reason: "Strong fundamentals, good profitability, and lower bankruptcy risk."
    };
  }

  if (piotroskiScore >= 7 && altmanScore > 3) {
    return {
      action: "BUY",
      cssClass: "good",
      reason: "Good financial strength and lower bankruptcy risk."
    };
  }

  if (piotroskiScore <= 2 || altmanScore < 1.8) {
    return {
      action: "SELL",
      cssClass: "bad",
      reason: "Weak fundamentals or elevated financial distress risk."
    };
  }

  if (piotroskiScore <= 4 || roa < 0 || grossMargin < 0.15) {
    return {
      action: "WAIT",
      cssClass: "neutral",
      reason: "The company has mixed or weak signals. Wait for stronger numbers."
    };
  }

  return {
    action: "HOLD",
    cssClass: "neutral",
    reason: "The company has mixed signals. Not clearly strong enough for a buy signal."
  };
}

function renderOverview(data) {
  const container = document.getElementById("overview");
  const m = calculateMetrics(data);
  const p = calculatePiotroski(data);
  const rec = getRecommendation(p.score, m.altman, m.roa, m.grossMargin);

  let piotroskiClass = "neutral";
  let piotroskiSignal = "Mixed";

  if (p.score >= 8) {
    piotroskiClass = "good";
    piotroskiSignal = "Strong";
  } else if (p.score <= 2) {
    piotroskiClass = "bad";
    piotroskiSignal = "Weak";
  }

  let altmanClass = "neutral";
  let altmanSignal = "Gray Zone";

  if (m.altman > 3) {
    altmanClass = "good";
    altmanSignal = "Lower Bankruptcy Risk";
  } else if (m.altman < 1.8) {
    altmanClass = "bad";
    altmanSignal = "Higher Bankruptcy Risk";
  }

  container.innerHTML = `
    <div class="card recommendation-card">
      <h3>Suggested Action</h3>
      <div class="recommendation ${rec.cssClass}">
        ${rec.action}
      </div>
      <p>${rec.reason}</p>
      <p class="small-note">Educational formula-based signal only, not real financial advice.</p>
    </div>

    <div class="card">
      <h3>${data.overview.Name || "Company Name Not Available"}</h3>
      <p><strong>Ticker:</strong> ${data.overview.Symbol || "N/A"}</p>
      <p><strong>Exchange:</strong> ${data.overview.Exchange || "N/A"}</p>
      <p><strong>Sector:</strong> ${data.overview.Sector || "N/A"}</p>
      <p><strong>Industry:</strong> ${data.overview.Industry || "N/A"}</p>
    </div>

    <div class="card">
      <h3>Piotroski F-Score</h3>
      <div class="big-number ${piotroskiClass}">${p.score}/9</div>
      <p>${piotroskiSignal} formula signal</p>
    </div>

    <div class="card">
      <h3>Altman Z-Score</h3>
      <div class="big-number ${altmanClass}">${fmt(m.altman)}</div>
      <p>${altmanSignal}</p>
    </div>

    <div class="card">
      <h3>Net Income</h3>
      <div class="big-number">${formatLargeNumber(m.netIncome)}</div>
      <p>Latest annual net income</p>
    </div>

    <div class="card">
      <h3>Revenue</h3>
      <div class="big-number">${formatLargeNumber(m.revenue)}</div>
      <p>Latest annual revenue</p>
    </div>

    <div class="card">
      <h3>ROA</h3>
      <div class="big-number">${pct(m.roa)}</div>
      <p>Net Income / Total Assets</p>
    </div>

    <div class="card">
      <h3>Current Ratio</h3>
      <div class="big-number">${fmt(m.currentRatio)}</div>
      <p>Current Assets / Current Liabilities</p>
    </div>

    <div class="card">
      <h3>Gross Margin</h3>
      <div class="big-number">${pct(m.grossMargin)}</div>
      <p>Gross Profit / Net Sales</p>
    </div>

    <div class="card">
      <h3>P/B Ratio</h3>
      <div class="big-number">${fmt(m.pbRatio)}</div>
      <p>Market Price / Book Value Per Share</p>
    </div>

    <div class="card">
      <h3>Market Cap</h3>
      <div class="big-number">${formatLargeNumber(m.marketCap)}</div>
      <p>Market value of equity</p>
    </div>
  `;
}

function renderHealthPage() {
  const data = getData();
  const container = document.getElementById("health");

  if (!data) {
    container.innerHTML = `<p>Analyze a stock on the Overview page first.</p>`;
    return;
  }

  const m = calculateMetrics(data);

  container.innerHTML = `
    <div class="card">
      <h3>Net Income</h3>
      <div class="big-number">${formatLargeNumber(m.netIncome)}</div>
      <p>Latest annual net income</p>
    </div>

    <div class="card">
      <h3>ROA</h3>
      <div class="big-number">${pct(m.roa)}</div>
      <p><strong>Formula:</strong> Net Income / Total Assets</p>
      <p>${formatLargeNumber(m.netIncome)} / ${formatLargeNumber(m.totalAssets)}</p>
    </div>

    <div class="card">
      <h3>Current Ratio</h3>
      <div class="big-number">${fmt(m.currentRatio)}</div>
      <p><strong>Formula:</strong> Current Assets / Current Liabilities</p>
      <p>${formatLargeNumber(m.currentAssets)} / ${formatLargeNumber(m.currentLiabilities)}</p>
    </div>

    <div class="card">
      <h3>Gross Margin</h3>
      <div class="big-number">${pct(m.grossMargin)}</div>
      <p><strong>Formula:</strong> Gross Profit / Net Sales</p>
      <p>${formatLargeNumber(m.grossProfit)} / ${formatLargeNumber(m.revenue)}</p>
    </div>

    <div class="card">
      <h3>Book Value Per Share</h3>
      <div class="big-number">${money(m.bookValuePerShare)}</div>
      <p><strong>Formula:</strong> (Total Assets - Intangible Assets - Total Liabilities) / Shares Outstanding</p>
    </div>

    <div class="card">
      <h3>P/B Ratio</h3>
      <div class="big-number">${fmt(m.pbRatio)}</div>
      <p><strong>Formula:</strong> Market Price Per Share / Book Value Per Share</p>
      <p>${money(m.price)} / ${money(m.bookValuePerShare)}</p>
    </div>
  `;
}

function renderPiotroskiPage() {
  const data = getData();
  const container = document.getElementById("piotroski");

  if (!data) {
    container.innerHTML = `<p>Analyze a stock on the Overview page first.</p>`;
    return;
  }

  const p = calculatePiotroski(data);

  let signal = "Neutral / mixed";
  let cls = "neutral";

  if (p.score >= 8) {
    signal = "Suggested buy by this formula";
    cls = "good";
  } else if (p.score <= 2) {
    signal = "Suggested sell by this formula";
    cls = "bad";
  }

  container.innerHTML = `
    <div class="card">
      <h2>Score: <span class="${cls}">${p.score}/9</span></h2>
      <p>${signal}</p>
      <p class="warning">
        This is a formula-based educational signal, not real investment advice.
      </p>
    </div>

    ${p.checks.map(check => `
      <div class="row ${check.passed ? "pass" : "fail"}">
        <strong>${check.passed ? "✓" : "✗"} ${check.name}</strong>
        <p>
          ${
            check.passed
              ? "Earned 1 point."
              : "Did not earn this point. This is why the score is not 9/9."
          }
        </p>
      </div>
    `).join("")}
  `;
}

function renderAltmanPage() {
  const data = getData();
  const container = document.getElementById("altman");

  if (!data) {
    container.innerHTML = `<p>Analyze a stock on the Overview page first.</p>`;
    return;
  }

  const m = calculateMetrics(data);

  let signal = "Gray zone / mixed bankruptcy risk";
  let cls = "neutral";

  if (m.altman > 3) {
    signal = "Suggested buy by this formula: lower bankruptcy risk.";
    cls = "good";
  } else if (m.altman < 1.8) {
    signal = "Suggested sell by this formula: higher bankruptcy risk.";
    cls = "bad";
  }

  container.innerHTML = `
    <div class="card">
      <h2>Altman Z-Score: <span class="${cls}">${fmt(m.altman)}</span></h2>
      <p>${signal}</p>
      <p class="warning">
        This is a bankruptcy-risk formula. It should not be treated as real investment advice.
      </p>
    </div>

    <div class="card formula-box">
      <h3>Formula</h3>
      <p><strong>Z = 1.2A + 1.4B + 3.3C + 0.6D + 1.0E</strong></p>
      <p>A = Working Capital / Total Assets</p>
      <p>B = Retained Earnings / Total Assets</p>
      <p>C = EBIT / Total Assets</p>
      <p>D = Market Value of Equity / Total Liabilities</p>
      <p>E = Sales / Total Assets</p>
    </div>
  `;
}

function renderChartsPage() {
  const data = getData();

  if (!data) {
    document.querySelector("main").innerHTML =
      "<p>Analyze a stock on the Overview page first.</p>";
    return;
  }

  const timeSeries = data.prices["Time Series (Daily)"];

  if (!timeSeries) {
    document.querySelector("main").innerHTML =
      "<p>No price chart data available.</p>";
    return;
  }

  const dates = Object.keys(timeSeries).slice(0, 30).reverse();
  const prices = dates.map(date => Number(timeSeries[date]["4. close"]));

  new Chart(document.getElementById("priceChart"), {
    type: "line",
    data: {
      labels: dates,
      datasets: [
        {
          label: "Closing Price",
          data: prices,
          tension: 0.3
        }
      ]
    }
  });

  const reports = data.income.annualReports?.slice(0, 4).reverse();

  if (!reports || reports.length === 0) {
    return;
  }

  const years = reports.map(report => report.fiscalDateEnding);
  const revenue = reports.map(report => Number(report.totalRevenue));
  const netIncome = reports.map(report => Number(report.netIncome));

  new Chart(document.getElementById("financialChart"), {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        {
          label: "Revenue",
          data: revenue
        },
        {
          label: "Net Income",
          data: netIncome
        }
      ]
    }
  });
}