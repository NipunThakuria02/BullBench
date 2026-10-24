export interface Asset {
  symbol: string;
  slug: string;
  short: string;
  name: string;
  sector: string;
  mark: string;
  website: string;
  websiteLabel: string;
  nse: string;
  bse?: string;
  bseCode?: string;
  description: string;
}
export const ASSETS: Asset[] = [
  {
    symbol: "HDFCBANK.NS",
    slug: "hdfc-bank",
    short: "HDFC Bank",
    name: "HDFC Bank Ltd",
    sector: "Banking",
    mark: "HB",
    website: "https://www.hdfcbank.com/",
    websiteLabel: "hdfcbank.com",
    nse: "HDFCBANK",
    bseCode: "500180",
    bse: "https://www.bseindia.com/stock-share-price/hdfc-bank-ltd/hdfcbank/500180/",
    description:
      "HDFC Bank is an Indian private-sector bank offering retail, commercial and wholesale banking services. It forms the study’s same-sector pair with ICICI Bank.",
  },
  {
    symbol: "ICICIBANK.NS",
    slug: "icici-bank",
    short: "ICICI Bank",
    name: "ICICI Bank Ltd",
    sector: "Banking",
    mark: "IB",
    website: "https://www.icicibank.com/",
    websiteLabel: "icicibank.com",
    nse: "ICICIBANK",
    bseCode: "532174",
    bse: "https://www.bseindia.com/stock-share-price/icici-bank-ltd/icicibank/532174/",
    description:
      "ICICI Bank is an Indian private-sector bank providing banking and financial services. It shares the Nifty Bank sector context with HDFC Bank in this study.",
  },
  {
    symbol: "TCS.NS",
    slug: "tcs",
    short: "TCS",
    name: "Tata Consultancy Services Ltd",
    sector: "Information technology",
    mark: "TCS",
    website: "https://www.tcs.com/",
    websiteLabel: "tcs.com",
    nse: "TCS",
    bseCode: "532540",
    bse: "https://www.bseindia.com/stock-share-price/tata-consultancy-services-ltd/tcs/532540/",
    description:
      "Tata Consultancy Services is an IT services, consulting and business solutions company. Its forecasting models use Nifty IT as the sector context.",
  },
  {
    symbol: "RELIANCE.NS",
    slug: "reliance",
    short: "Reliance",
    name: "Reliance Industries Ltd",
    sector: "Energy",
    mark: "R",
    website: "https://www.ril.com/",
    websiteLabel: "ril.com",
    nse: "RELIANCE",
    bseCode: "500325",
    bse: "https://www.bseindia.com/stock-share-price/reliance-industries-ltd/reliance/500325/",
    description:
      "Reliance Industries operates across energy, materials, retail and digital services. The study uses Nifty Energy for its original sector-context feature.",
  },
  {
    symbol: "TATASTEEL.NS",
    slug: "tata-steel",
    short: "Tata Steel",
    name: "Tata Steel Ltd",
    sector: "Metals",
    mark: "TS",
    website: "https://www.tatasteel.com/",
    websiteLabel: "tatasteel.com",
    nse: "TATASTEEL",
    bseCode: "500470",
    bse: "https://www.bseindia.com/stock-share-price/tata-steel-ltd/tatasteel/500470/",
    description:
      "Tata Steel is a steel producer with operations in India and other markets. Its models use Nifty Metal as the sector-context series.",
  },
  {
    symbol: "^NSEI",
    slug: "nifty-50",
    short: "Nifty 50",
    name: "Nifty 50",
    sector: "Market benchmark",
    mark: "N50",
    website:
      "https://www.niftyindices.com/indices/equity/broad-based-indices/NIFTY-50",
    websiteLabel: "niftyindices.com",
    nse: "NIFTY 50",
    description:
      "Nifty 50 is a broad-market Indian equity index. It is evaluated alongside the five stocks as the market benchmark, with closing levels measured in index points.",
  },
];
export const exchangeLink = (asset: Asset) =>
  asset.symbol === "^NSEI"
    ? "https://www.nseindia.com/market-data/live-equity-market?symbol=NIFTY%2050"
    : `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(asset.nse)}`;
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function searchAssets(query: string): Asset[] {
  const needle = normalize(query);
  return ASSETS.filter(
    (a) =>
      !needle ||
      [a.short, a.name, a.symbol, a.nse].some((value) =>
        normalize(value).includes(needle),
      ),
  );
}
export const assetFromHash = () => {
  const match = window.location.hash.match(/^#\/asset\/([^/]+)/);
  return match ? (ASSETS.find((a) => a.slug === match[1]) ?? null) : null;
};
