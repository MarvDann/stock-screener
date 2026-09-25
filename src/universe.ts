/**
 * S&P 500 constituents (as of mid-2026), used only to seed the `tickers`
 * table on first run — edit the list from the Tickers page after that.
 * Some symbols use dots in their canonical form but are listed with
 * hyphens here to match most data providers' conventions.
 */
export const SAMPLE_UNIVERSE: string[] = [
  // Information Technology
  "AAPL", "MSFT", "NVDA", "AVGO", "CRM", "ADBE", "AMD", "INTC", "QCOM",
  "TXN", "AMAT", "LRCX", "MU", "KLAC", "SNPS", "CDNS", "MCHP", "ON",
  "FTNT", "PANW", "NOW", "PLTR", "ORCL", "IBM", "CSCO", "ACN", "INTU",
  "MSI", "KEYS", "NXPI", "ADI", "MPWR", "SWKS", "ZBRA",
  "TER", "EPAM", "GEN", "FFIV", "NTAP", "HPE", "HPQ",
  "GDDY", "TRMB", "PTC", "VRSN", "AKAM", "WDC", "SMCI",

  // Communication Services
  "GOOGL", "META", "NFLX", "DIS", "CMCSA", "TMUS", "T", "VZ",
  "CHTR", "TTWO", "WBD", "MTCH", "PARA", "OMC",
  "FOXA", "FOX", "NWSA", "NWS", "LYV",

  // Consumer Discretionary
  "AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "TJX",
  "BKNG", "ABNB", "MAR", "HLT", "CMG", "ORLY", "AZO", "ROST",
  "DHI", "LEN", "PHM", "NVR", "GRMN", "POOL", "DECK",
  "ULTA", "BBY", "DRI", "YUM", "EBAY", "ETSY",
  "GPC", "LKQ", "APTV", "BWA", "CZR", "MGM", "WYNN", "RCL",
  "CCL", "NCLH", "HAS", "F", "GM",

  // Consumer Staples
  "PG", "PEP", "KO", "COST", "WMT", "PM", "MO", "MDLZ",
  "CL", "KMB", "GIS", "SJM", "HSY", "ADM", "BG",
  "STZ", "TAP", "KHC", "MNST", "EL", "CHD", "CLX", "CAG",
  "CPB", "SYY", "KR", "TGT", "DG", "DLTR",

  // Health Care
  "LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT", "PFE",
  "AMGN", "GILD", "ISRG", "MDT", "BMY", "VRTX", "REGN", "BSX",
  "SYK", "ZBH", "BDX", "EW", "DXCM", "IDXX", "IQV", "A",
  "DHR", "BAX", "CI", "HCA", "ELV", "CNC", "MOH", "HUM",
  "ALGN", "MTD", "WAT", "BIO", "TECH", "CRL",
  "VEEV", "PODD",

  // Financials
  "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK",
  "SPGI", "AXP", "SCHW", "CB", "PGR", "AFL", "MET",
  "PRU", "AIG", "TRV", "ALL", "ICE", "CME", "MCO", "MSCI",
  "NDAQ", "FIS", "COF", "USB", "PNC", "TFC",
  "STT", "FITB", "HBAN", "CFG", "RF", "KEY",
  "CINF", "GL", "AIZ", "L", "RJF", "BRO", "WRB",

  // Energy
  "XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO",
  "OXY", "FANG", "DVN", "HAL", "BKR",
  "APA", "OVV", "TRGP", "WMB", "KMI",
  "OKE", "ET",

  // Industrials
  "GE", "CAT", "HON", "UNP", "UPS", "RTX", "BA", "DE",
  "LMT", "GD", "NOC", "MMM", "EMR", "ITW", "ETN", "ROK",
  "PH", "OTIS", "CARR", "FAST", "CTAS", "CPRT", "PAYX",
  "VRSK", "WM", "RSG", "FDX", "CSX", "NSC", "PCAR",
  "TT", "SWK", "IR", "DOV", "AME", "XYL", "IEX",
  "ROP", "NDSN", "AOS", "SNA", "GWW", "HUBB", "WAB",
  "DAL", "UAL", "LUV", "AAL", "AXON", "LDOS", "J",

  // Materials
  "LIN", "APD", "SHW", "ECL", "DD", "NEM", "FCX",
  "NUE", "STLD", "VMC", "MLM", "DOW", "PPG", "RPM",
  "EMN", "CE", "ALB", "FMC", "CF", "MOS", "IP", "PKG",
  "AVY", "AMCR",

  // Real Estate
  "PLD", "AMT", "CCI", "EQIX", "PSA", "O", "SPG", "DLR",
  "WELL", "VICI", "ARE", "EXR", "AVB", "EQR", "MAA",
  "ESS", "UDR", "CPT", "INVH", "SUI", "KIM",
  "REG", "FRT", "BXP", "VTR", "HST", "IRM",

  // Utilities
  "NEE", "DUK", "SO", "D", "AEP", "SRE", "EXC", "XEL",
  "ED", "WEC", "ES", "AWK", "DTE", "ETR", "FE", "PPL",
  "AEE", "CMS", "EVRG", "ATO", "NI", "PNW", "LNT",
  "CEG",
];

export const BENCHMARK_SYMBOL = "SPY";
