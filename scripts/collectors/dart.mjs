import { getEnv } from "../lib/env.mjs";
import { fetchJson, sleep, toCompactDate } from "../lib/http.mjs";

function isConfigured(value) {
  return Boolean(value) && !value.startsWith("your-");
}

const DISCLOSURE_TYPES = [
  { code: "A", name: "Periodic Disclosure" },
  { code: "B", name: "Major Issues" },
  { code: "C", name: "Issuance Disclosure" },
  { code: "D", name: "Equity Disclosure" },
  { code: "E", name: "Other Disclosure" },
];
const DART_PAGE_DELAY_MS = 120;

function parseFinalFlag(value) {
  if (value === "Y" || value === "y") {
    return 1;
  }

  return 0;
}

function detectEventCategory(reportName) {
  const value = String(reportName ?? "");

  if (/사업보고서|반기보고서|분기보고서|잠정실적|영업\(잠정\)실적/i.test(value)) {
    return "earnings";
  }

  if (/유상증자|무상증자|전환사채|신주인수권부사채|교환사채|주식매수선택권/i.test(value)) {
    return "capital_raise";
  }

  if (/단일판매|공급계약|수주|계약체결/i.test(value)) {
    return "order_contract";
  }

  if (/합병|분할|영업양수|영업양도|타법인.?주식|유형자산|소송|회생절차|부도|영업정지/i.test(value)) {
    return "major_corporate_action";
  }

  return "uncategorized";
}

async function fetchDisclosureTypePage({ apiKey, baseUrl, tradeDate, disclosureTypeCode, corpClass, pageNo }) {
  const url = new URL(`${baseUrl}/list.json`);
  url.searchParams.set("crtfc_key", apiKey);
  url.searchParams.set("bgn_de", toCompactDate(tradeDate));
  url.searchParams.set("end_de", toCompactDate(tradeDate));
  url.searchParams.set("last_reprt_at", "Y");
  url.searchParams.set("corp_cls", corpClass);
  url.searchParams.set("pblntf_ty", disclosureTypeCode);
  url.searchParams.set("sort", "date");
  url.searchParams.set("sort_mth", "asc");
  url.searchParams.set("page_no", String(pageNo));
  url.searchParams.set("page_count", "100");

  const payload = await fetchJson(url.toString());
  return payload;
}

export async function collectDartDisclosureEvents(tradeDate) {
  const apiKey = getEnv("DART_API_KEY");
  const baseUrl = getEnv("DART_BASE_URL", "https://opendart.fss.or.kr/api");

  if (!isConfigured(apiKey)) {
    return {
      collector: "collectDartDisclosureEvents",
      status: "blocked",
      detail: "DART_API_KEY is missing.",
      source: baseUrl,
      rows: [],
      corpRows: [],
    };
  }

  const rows = [];
  const corpRows = [];

  for (const disclosureType of DISCLOSURE_TYPES) {
    for (const corpClass of ["Y", "K"]) {
      let pageNo = 1;
      let totalPages = 1;

      while (pageNo <= totalPages) {
        const payload = await fetchDisclosureTypePage({
          apiKey,
          baseUrl,
          tradeDate,
          disclosureTypeCode: disclosureType.code,
          corpClass,
          pageNo,
        });

        if (payload.status && payload.status !== "000" && payload.status !== "013") {
          throw new Error(`DART list API returned ${payload.status}: ${payload.message ?? "unknown error"}`);
        }

        const pageCount = Number(payload.page_count ?? 100);
        const totalCount = Number(payload.total_count ?? 0);
        totalPages = Math.max(1, Math.ceil(totalCount / Math.max(pageCount, 1)));

        for (const item of payload.list ?? []) {
          const ticker = item.stock_code ? String(item.stock_code).trim() : null;
          const corpCode = String(item.corp_code ?? "").trim();
          const corpName = String(item.corp_name ?? "").trim();
          const reportName = String(item.report_nm ?? "").trim();

          corpRows.push({
            corp_code: corpCode,
            ticker,
            corp_name: corpName,
            modify_date: null,
            is_active: 1,
          });

          rows.push({
            receipt_no: String(item.rcept_no ?? "").trim(),
            ticker,
            corp_code: corpCode,
            corp_name: corpName,
            report_name: reportName,
            filed_date: tradeDate,
            submitter_name: item.flr_nm ? String(item.flr_nm).trim() : null,
            remark: item.rm ? String(item.rm).trim() : null,
            disclosure_type_code: disclosureType.code,
            disclosure_type_name: disclosureType.name,
            disclosure_detail_code: null,
            disclosure_detail_name: null,
            event_category: detectEventCategory(reportName),
            is_final_report: parseFinalFlag(item.last_reprt_at),
          });
        }

        pageNo += 1;
        if (pageNo <= totalPages) {
          await sleep(DART_PAGE_DELAY_MS);
        }
      }

      await sleep(DART_PAGE_DELAY_MS);
    }
  }

  return {
    collector: "collectDartDisclosureEvents",
    status: rows.length > 0 ? "completed" : "empty",
    detail: `Collected ${rows.length} DART disclosures for ${tradeDate}.`,
    source: baseUrl,
    rows,
    corpRows,
  };
}
