// src/main.ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// ../../packages/i18n/src/plural.ts
var ARABIC = new Intl.PluralRules("ar");
var ENGLISH = new Intl.PluralRules("en");
function arabicCount(count, forms) {
  const category = ARABIC.select(count);
  const form = category === "one" ? forms.one : category === "two" ? forms.two : category === "few" ? forms.few : category === "other" && forms.other !== void 0 ? forms.other : forms.many;
  return form.replaceAll("{n}", String(count));
}
function englishForm(count, one, other) {
  return ENGLISH.select(count) === "one" ? one : other;
}
function englishCount(count, one, other) {
  return `${count} ${englishForm(count, one, other)}`;
}

// ../../packages/i18n/src/integrations.ts
var MORE_RULES = {
  one: "قاعدة أخرى",
  two: "قاعدتان أخريان",
  few: "{n} قواعد أخرى",
  many: "{n} قاعدة أخرى"
};
var PLACES = {
  one: "موضع واحد",
  two: "موضعان",
  few: "{n} مواضع",
  many: "{n} موضعاً",
  other: "{n} موضع"
};
var SECONDS = {
  one: "ثانية واحدة",
  two: "ثانيتين",
  few: "{n} ثوانٍ",
  many: "{n} ثانية"
};
var INTEGRATIONS_UI = {
  reviewed: false,
  ar: {
    action: {
      heading: "تقرير Arablyzer",
      score: (score) => `الدرجة: **${String(score)} من 100**`,
      noScore: "لا درجة لهذا الفحص: لم تُبلَغ الصفحة أو لم تنطبق عليها قاعدة.",
      partial: "تعذّر تشغيل بعض القواعد، فالدرجة تحسب ما عمل منها فقط.",
      severity: {
        critical: "حرجة",
        serious: "خطيرة",
        moderate: "متوسطة",
        minor: "طفيفة",
        info: "معلومة"
      },
      counts: "المشكلات حسب الخطورة",
      topIssues: "أهم المشكلات",
      columns: ["القاعدة", "الخطورة", "العدد", "مثال"],
      moreIssues: (more) => `وفي التقرير الكامل ${arabicCount(more, MORE_RULES)}.`,
      noIssues: "لا مشكلات. أحسنت.",
      fullReport: "افتح التقرير الكامل",
      started: "بدأ الفحص ولم ننتظره (`wait: false`). افتح التقرير عند انتهائه من الرابط أدناه.",
      gate: {
        passed: (failOn) => `اجتاز الفحص شرط الفشل: لا نتائج بخطورة ${failOn} أو أشد.`,
        failed: (count, failOn) => `فشل الفحص: ${String(count)} من النتائج بخطورة ${failOn} أو أشد.`
      },
      errorHeading: "تعذّر الفحص",
      problems: {
        unauthorized: "مفتاح الـ API غير صالح أو أُلغي. أنشئ مفتاحاً من صفحة حسابك.",
        plan_limit: "بلغت حدّ خطة حسابك، أو أنها لا تشمل الـ API.",
        rate_limited: "بلغت حداً مؤقتاً للطلبات أو للفحوص.",
        blocked_target: "هذا العنوان لا يُفحص: عنوان داخلي أو خاص.",
        invalid_url: "هذا العنوان ليس صفحة يمكن فحصها (http أو https).",
        invalid_request: "رفضت الخدمة الطلب.",
        accounts_off: "الحسابات مطفأة في هذه الخدمة، فلا API.",
        network: "تعذّر الاتصال بـ Arablyzer.",
        unavailable: "الخدمة غير متاحة الآن.",
        timeout: "استغرق الفحص أطول من `timeout_seconds`.",
        scan_failed: "انتهى الفحص بالفشل: لم تُبلَغ الصفحة.",
        bad_response: "ردّت الخدمة بما لا نعرفه. تأكد من `api_url`."
      },
      retryAfter: (seconds2) => `حاول بعد ${arabicCount(seconds2, SECONDS)}.`,
      footer: "فُحصت بـ Arablyzer"
    },
    extension: {
      name: "Arablyzer: فاحص المواقع العربية",
      description: "افحص الصفحة المفتوحة بقواعد Arablyzer، واعرف درجتها وأهم مشكلاتها دون مغادرة المتصفح.",
      popup: {
        page: "الصفحة الحالية",
        scan: "افحص هذه الصفحة",
        scanAgain: "افحص من جديد",
        scanning: "نفحص الصفحة…",
        states: { queued: "الفحص في الطابور…", running: "نفحص الصفحة…" },
        score: "الدرجة",
        scoreOf: (score) => `${String(score)} من 100`,
        bands: { good: "جيدة", mid: "متوسطة", low: "ضعيفة" },
        noScore: "لا درجة لهذا الفحص",
        partial: "تعذّر تشغيل بعض القواعد، فالدرجة تحسب ما عمل منها.",
        severity: {
          critical: "حرجة",
          serious: "خطيرة",
          moderate: "متوسطة",
          minor: "طفيفة",
          info: "معلومة"
        },
        topIssues: "أهم المشكلات",
        noIssues: "لا مشكلات ظاهرة. أحسنت.",
        occurrences: (count) => arabicCount(count, PLACES),
        moreIssues: (more) => `في التقرير الكامل ${arabicCount(more, MORE_RULES)}`,
        openReport: "افتح التقرير الكامل",
        ruleLink: (title) => `اقرأ عن القاعدة: ${title}`,
        noKeyTitle: "لم تضف مفتاح API بعد",
        noKeyLead: "بمفتاح من حسابك تفحص الإضافة الصفحة هنا وتعرض النتيجة. وبدونه نفتح لك صفحة الفحص في الموقع.",
        openSite: "افتح صفحة الفحص في الموقع",
        addKey: "أضف مفتاحاً",
        settings: "الإعدادات",
        unsupported: "لا يمكن فحص هذه الصفحة. افتح صفحة موقع على http أو https.",
        retryAfter: (seconds2) => `حاول بعد ${arabicCount(seconds2, SECONDS)}.`,
        noPermission: "لم تُمنح الإضافة إذن الاتصال بهذه الخدمة. افتح الإعدادات واحفظ من جديد.",
        problems: {
          unauthorized: "المفتاح غير صالح أو أُلغي. أضف مفتاحاً جديداً من الإعدادات.",
          plan_limit: "بلغت حدّ خطة حسابك.",
          rate_limited: "بلغت حداً مؤقتاً. انتظر قليلاً.",
          blocked_target: "لا يُفحص هذا العنوان: عنوان داخلي أو خاص.",
          invalid_url: "هذا العنوان ليس صفحة يمكن فحصها.",
          invalid_request: "رفضت الخدمة الطلب.",
          accounts_off: "الحسابات مطفأة في هذه الخدمة.",
          network: "تعذّر الاتصال بـ Arablyzer. تحقق من الشبكة.",
          unavailable: "الخدمة غير متاحة الآن. حاول بعد قليل.",
          timeout: "استغرق الفحص أطول من المتوقع. افتح التقرير لاحقاً.",
          scan_failed: "انتهى الفحص بالفشل: لم تُبلَغ الصفحة.",
          bad_response: "ردّت الخدمة بما لا نعرفه. تأكد من عنوان الخدمة في الإعدادات."
        }
      },
      options: {
        title: "إعدادات Arablyzer",
        lead: "مفتاحك يبقى عندك: تتصل الإضافة بخدمة Arablyzer وحدها، ولا تجمع شيئاً ولا تتتبّعك.",
        keyLabel: "مفتاح API",
        keyHelp: "من صفحة حسابك، قسم «مفاتيح API». يبدأ بـ arb_. يُحفظ في تخزين Chrome المتزامن، فيصل إلى متصفحاتك الأخرى المسجّلة بحسابك.",
        hostLabel: "عنوان الخدمة",
        hostHelp: "اتركه كما هو إلا إن كنت تشغّل Arablyzer على خادمك. سيسألك Chrome الإذن بالاتصال بهذا العنوان وحده.",
        langLabel: "لغة الإضافة",
        langAuto: "حسب المتصفح",
        save: "حفظ",
        saved: "حُفظت الإعدادات.",
        test: "جرّب المفتاح",
        testing: "نجرّب المفتاح…",
        testOk: "المفتاح يعمل.",
        remove: "احذف المفتاح",
        removed: "حُذف المفتاح.",
        privacy: "لا تحليلات ولا شيفرة من الخارج. تُرسل الإضافة عنوان الصفحة التي تفحصها إلى الخدمة، لا غير.",
        problems: {
          badKey: "المفتاح يبدأ بـ arb_ ويليه 43 حرفاً.",
          badHost: "اكتب عنواناً يبدأ بـ https:// (أو http://localhost للتجربة).",
          permission: "لم تمنح الإذن بالاتصال بهذا العنوان، فلم يُحفظ.",
          noKey: "أضف مفتاحاً أولاً.",
          unauthorized: "المفتاح غير صالح أو أُلغي.",
          plan_limit: "خطة حسابك لا تشمل الـ API.",
          rate_limited: "طلبات كثيرة. حاول بعد قليل.",
          blocked_target: "رفضت الخدمة الطلب.",
          invalid_url: "رفضت الخدمة الطلب.",
          invalid_request: "رفضت الخدمة الطلب.",
          accounts_off: "الحسابات مطفأة في هذه الخدمة.",
          network: "تعذّر الاتصال. تحقق من العنوان والشبكة.",
          unavailable: "الخدمة غير متاحة الآن.",
          timeout: "استغرق الاتصال طويلاً.",
          scan_failed: "رفضت الخدمة الطلب.",
          bad_response: "ردّت الخدمة بما لا نعرفه. تأكد من العنوان."
        }
      }
    }
  },
  en: {
    action: {
      heading: "Arablyzer report",
      score: (score) => `Score: **${String(score)} of 100**`,
      noScore: "No score for this scan: the page was not reached, or no rule applied.",
      partial: "Some rules could not run, so the score counts only those that did.",
      severity: {
        critical: "Critical",
        serious: "Serious",
        moderate: "Moderate",
        minor: "Minor",
        info: "Info"
      },
      counts: "Findings by severity",
      topIssues: "The worst problems",
      columns: ["Rule", "Severity", "Count", "Example"],
      moreIssues: (more) => `${englishCount(more, "more rule is", "more rules are")} in the full report.`,
      noIssues: "No problems found. Well done.",
      fullReport: "Open the full report",
      started: "The scan was started and not waited for (`wait: false`). Open the report when it finishes, from the link below.",
      gate: {
        passed: (failOn) => `The check passes: no findings at ${failOn} severity or worse.`,
        failed: (count, failOn) => `The check fails: ${englishCount(count, "finding", "findings")} at ${failOn} severity or worse.`
      },
      errorHeading: "The scan did not run",
      problems: {
        unauthorized: "The API key is not valid, or was revoked. Make a key on your account page.",
        plan_limit: "The account has reached its plan’s limit, or its plan has no API.",
        rate_limited: "A temporary request or scan limit was reached.",
        blocked_target: "This address is never scanned: it is internal or private.",
        invalid_url: "This address is not a page that can be scanned (http or https).",
        invalid_request: "The service refused the request.",
        accounts_off: "Accounts are off in this service, so there is no API.",
        network: "Arablyzer could not be reached.",
        unavailable: "The service is unavailable right now.",
        timeout: "The scan took longer than `timeout_seconds`.",
        scan_failed: "The scan ended in failure: the page was not reached.",
        bad_response: "The service answered in a way this action does not know. Check `api_url`."
      },
      retryAfter: (seconds2) => `Try again in ${String(seconds2)} seconds.`,
      footer: "Checked with Arablyzer"
    },
    extension: {
      name: "Arablyzer: Arabic website checker",
      description: "Check the open page with Arablyzer’s rules and see its score and its worst problems without leaving the browser.",
      popup: {
        page: "Current page",
        scan: "Check this page",
        scanAgain: "Check again",
        scanning: "Checking the page…",
        states: { queued: "The scan is queued…", running: "Checking the page…" },
        score: "Score",
        scoreOf: (score) => `${String(score)} of 100`,
        bands: { good: "Good", mid: "Fair", low: "Poor" },
        noScore: "No score for this scan",
        partial: "Some rules could not run, so the score counts only those that did.",
        severity: {
          critical: "Critical",
          serious: "Serious",
          moderate: "Moderate",
          minor: "Minor",
          info: "Info"
        },
        topIssues: "The worst problems",
        noIssues: "No problems found. Well done.",
        occurrences: (count) => englishCount(count, "place", "places"),
        moreIssues: (more) => `${englishCount(more, "more rule", "more rules")} in the full report`,
        openReport: "Open the full report",
        ruleLink: (title) => `Read about the rule: ${title}`,
        noKeyTitle: "No API key yet",
        noKeyLead: "With a key from your account, the extension checks the page here and shows the result. Without one, we open the site’s scan page for you.",
        openSite: "Open the scan page on the site",
        addKey: "Add a key",
        settings: "Settings",
        unsupported: "This page cannot be checked. Open a website on http or https.",
        retryAfter: (seconds2) => `Try again in ${String(seconds2)} seconds.`,
        noPermission: "The extension has no permission to reach this service. Open the settings and save again.",
        problems: {
          unauthorized: "The key is not valid, or was revoked. Add a new key in the settings.",
          plan_limit: "The account has reached its plan’s limit.",
          rate_limited: "A temporary limit was reached. Wait a little.",
          blocked_target: "This address is never scanned: it is internal or private.",
          invalid_url: "This address is not a page that can be scanned.",
          invalid_request: "The service refused the request.",
          accounts_off: "Accounts are off in this service.",
          network: "Arablyzer could not be reached. Check the network.",
          unavailable: "The service is unavailable right now. Try again in a moment.",
          timeout: "The scan took longer than expected. Open the report later.",
          scan_failed: "The scan ended in failure: the page was not reached.",
          bad_response: "The service answered in a way this extension does not know. Check the service address in the settings."
        }
      },
      options: {
        title: "Arablyzer settings",
        lead: "Your key stays with you: the extension talks to the Arablyzer service alone, and collects nothing and tracks nothing.",
        keyLabel: "API key",
        keyHelp: "From your account page, in “API keys”. It begins with arb_. It is kept in Chrome’s synced storage, so it reaches your other browsers signed in to your account.",
        hostLabel: "Service address",
        hostHelp: "Leave it as it is unless you run Arablyzer on your own server. Chrome will ask your permission to reach that address alone.",
        langLabel: "Extension language",
        langAuto: "Follow the browser",
        save: "Save",
        saved: "Settings saved.",
        test: "Test the key",
        testing: "Testing the key…",
        testOk: "The key works.",
        remove: "Remove the key",
        removed: "The key was removed.",
        privacy: "No analytics and no remote code. The extension sends the address of the page you check to the service, and nothing else.",
        problems: {
          badKey: "A key begins with arb_ followed by 43 characters.",
          badHost: "Write an address that begins with https:// (or http://localhost to try it).",
          permission: "Permission to reach that address was not given, so it was not saved.",
          noKey: "Add a key first.",
          unauthorized: "The key is not valid, or was revoked.",
          plan_limit: "The account’s plan has no API.",
          rate_limited: "Too many requests. Try again in a moment.",
          blocked_target: "The service refused the request.",
          invalid_url: "The service refused the request.",
          invalid_request: "The service refused the request.",
          accounts_off: "Accounts are off in this service.",
          network: "Could not connect. Check the address and the network.",
          unavailable: "The service is unavailable right now.",
          timeout: "The connection took too long.",
          scan_failed: "The service refused the request.",
          bad_response: "The service answered in a way this extension does not know. Check the address."
        }
      }
    }
  }
};

// ../core/src/client.ts
var ApiError = class extends Error {
  code;
  status;
  /** When the API asked to be tried again (429): `Retry-After`, or `details.retryAfterSeconds`. */
  retryAfterSeconds;
  /** Which limit a `plan_limit` names (`details.limit`). */
  limit;
  constructor(code, message, status, extra = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = extra.retryAfterSeconds;
    this.limit = extra.limit;
  }
};
var TERMINAL_STATES = ["complete", "partial", "failed"];
var STATES = ["queued", "running", "complete", "partial", "failed"];
var CODES = [
  "invalid_request",
  "invalid_url",
  "blocked_target",
  "unauthorized",
  "plan_limit",
  "not_found",
  "report_not_ready",
  "rate_limited",
  "accounts_off",
  "unavailable"
];
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function asScan(value) {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.url !== "string" || typeof value.state !== "string" || !STATES.includes(value.state) || !isRecord(value.links) || typeof value.links.page !== "string" || value.score !== null && typeof value.score !== "number") {
    throw new ApiError(
      "bad_response",
      "The API answered in a shape this client does not know.",
      502
    );
  }
  return value;
}
function parseJson(text) {
  try {
    return text === "" ? null : JSON.parse(text);
  } catch {
    return null;
  }
}
function seconds(value) {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.ceil(n) : void 0;
}
function createApiClient(options) {
  const base = options.baseUrl.replace(/\/+$/, "");
  async function call(method, path, body) {
    let response;
    try {
      response = await options.fetcher(`${base}${path}`, {
        method,
        headers: {
          ...options.headers,
          authorization: `Bearer ${options.apiKey}`,
          accept: "application/json",
          ...body === void 0 ? {} : { "content-type": "application/json" }
        },
        ...body === void 0 ? {} : { body: JSON.stringify(body) },
        signal: AbortSignal.timeout(options.timeoutMs ?? 3e4)
      });
    } catch {
      throw new ApiError("network", "Arablyzer could not be reached.", 0);
    }
    const parsed = parseJson(await response.text());
    if (response.ok) return parsed;
    const error = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : void 0;
    const details = error !== void 0 && isRecord(error.details) ? error.details : {};
    const code = typeof error?.code === "string" && CODES.includes(error.code) ? error.code : "unavailable";
    const retryAfterSeconds = seconds(details.retryAfterSeconds) ?? seconds(response.headers.get("retry-after"));
    throw new ApiError(
      code,
      typeof error?.message === "string" ? error.message : `The API answered ${response.status}.`,
      response.status,
      {
        ...retryAfterSeconds === void 0 ? {} : { retryAfterSeconds },
        ...typeof details.limit === "string" ? { limit: details.limit } : {}
      }
    );
  }
  const data = (answer) => isRecord(answer) ? answer.data : void 0;
  return {
    async startScan(url) {
      return asScan(data(await call("POST", "/api/v1/scans", { url })));
    },
    async getScan(id) {
      return asScan(data(await call("GET", `/api/v1/scans/${encodeURIComponent(id)}`)));
    },
    async getReport(id) {
      const report = data(await call("GET", `/api/v1/scans/${encodeURIComponent(id)}/report`));
      if (!isRecord(report) || !Array.isArray(report.findings) || !isRecord(report.score)) {
        throw new ApiError("bad_response", "The API answered without a report.", 502);
      }
      return report;
    },
    async checkKey() {
      await call("GET", "/api/v1/scans?limit=1");
    }
  };
}
function absolute(baseUrl, link) {
  try {
    return new URL(link, `${baseUrl.replace(/\/+$/, "")}/`).href;
  } catch {
    return link;
  }
}

// ../core/src/issues.ts
var SEVERITIES = ["critical", "serious", "moderate", "minor", "info"];
var severityRank = (severity) => SEVERITIES.indexOf(severity);
function groupIssues(report) {
  const grouped = /* @__PURE__ */ new Map();
  for (const finding of report.findings) {
    const known = grouped.get(finding.ruleId);
    if (known !== void 0) {
      grouped.set(finding.ruleId, { ...known, occurrences: known.occurrences + 1 });
      continue;
    }
    const { selector, url } = finding.evidence;
    const example = {
      ...selector === void 0 ? {} : { selector },
      ...url === void 0 ? {} : { url }
    };
    grouped.set(finding.ruleId, {
      ruleId: finding.ruleId,
      severity: finding.severity,
      occurrences: 1,
      message: { ar: finding.message.ar, en: finding.message.en },
      ...Object.keys(example).length === 0 ? {} : { example }
    });
  }
  return [...grouped.values()].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity) || b.occurrences - a.occurrences || a.ruleId.localeCompare(b.ruleId)
  );
}
function countAtOrAbove(bySeverity, failOn) {
  if (failOn === "none") return 0;
  return SEVERITIES.filter((severity) => severityRank(severity) <= severityRank(failOn)).reduce(
    (sum, severity) => sum + bySeverity[severity],
    0
  );
}

// ../core/src/wait.ts
var POLL_DELAYS_MS = [3e3, 3e3, 4e3, 5e3, 6e3, 8e3, 1e4];
var MAX_RETRY_AFTER_MS = 6e4;
var MAX_TRANSIENT = 4;
async function waitForScan(options) {
  const { client, scanId, timeoutMs, sleep, now } = options;
  const deadline = now() + timeoutMs;
  let scan = options.first;
  let step = 0;
  let transient = 0;
  for (; ; ) {
    if (scan !== void 0) {
      options.onState?.(scan);
      if (TERMINAL_STATES.includes(scan.state)) return scan;
    }
    const base = POLL_DELAYS_MS[Math.min(step, POLL_DELAYS_MS.length - 1)] ?? 1e4;
    step++;
    if (now() + base > deadline) {
      throw new ApiError("timeout", "The scan did not finish in the time given.", 0);
    }
    await sleep(base);
    try {
      scan = await client.getScan(scanId);
      transient = 0;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.code === "rate_limited") {
        const pause = Math.min((error.retryAfterSeconds ?? 10) * 1e3, MAX_RETRY_AFTER_MS);
        if (now() + pause > deadline) {
          throw new ApiError("timeout", "The scan did not finish in the time given.", 0);
        }
        await sleep(pause);
        continue;
      }
      const retryable = error.code === "network" || error.code === "unavailable";
      if (!retryable || ++transient >= MAX_TRANSIENT) throw error;
    }
  }
}

// ../core/src/links.ts
var DEFAULT_ORIGIN = "https://arablyzer.com";
var prefix = (lang) => lang === "ar" ? "" : "/en";
function rulePageUrl(origin, lang, ruleId) {
  return `${origin.replace(/\/+$/, "")}${prefix(lang)}/rules/${encodeURIComponent(ruleId)}`;
}

// src/github.ts
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
function plain(text) {
  const line = text.replace(/[\r\n]+/g, " ");
  return line.startsWith("::") ? ` ${line}` : line;
}
var command = (text) => plain(text).replace(/%/g, "%25");
function runnerSink(env, write) {
  const line = (text) => {
    write(`${text}
`);
  };
  const appendTo = (name, text) => {
    const file = env[name];
    if (file !== void 0 && file !== "") appendFileSync(file, text);
  };
  return {
    info: (text) => {
      line(plain(text));
    },
    warning: (text) => {
      line(`::warning::${command(text)}`);
    },
    error: (text) => {
      line(`::error::${command(text)}`);
    },
    output: (name, value) => {
      const delimiter = `ghadelimiter_${randomUUID()}`;
      appendTo("GITHUB_OUTPUT", `${name}<<${delimiter}
${value}
${delimiter}
`);
    },
    summary: (markdown) => {
      appendTo("GITHUB_STEP_SUMMARY", `${markdown}
`);
    },
    mask: (secret) => {
      line(`::add-mask::${secret}`);
    }
  };
}

// ../../packages/api-contract/src/codes.ts
var URL_ERROR_CODES = [
  "invalid-url",
  "unsupported-scheme",
  "url-too-long",
  "credentials-in-url",
  "port-not-allowed",
  "blocked-host",
  "blocked-address",
  "dns-failed"
];
var SCAN_ERROR_CODES = [
  /** Not a request the form sends: not JSON, too large, or other fields. */
  "bad-request",
  ...URL_ERROR_CODES,
  /** Turnstile could not tell that a person sent the form. */
  "turnstile-failed",
  /** The visitor's scans reached the anonymous limit; retryAfterSeconds says when to try again. */
  "rate-limited",
  /** The API or its queue is down or full. */
  "unavailable"
];
var MAX_PDF_BYTES = 8 * 1024 * 1024;
var MAX_LOGO_BYTES = 200 * 1024;
var API_KEY_PATTERN = /^arb_[A-Za-z0-9_-]{43}$/;

// src/inputs.ts
import { isAbsolute, relative, resolve } from "node:path";
var InputError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
};
var MAX_URLS = 10;
var input = (env, name) => env[`INPUT_${name.toUpperCase()}`]?.trim() ?? "";
function pages(env) {
  const parts = `${input(env, "url")}
${input(env, "urls")}`.split(/[\s,]+/).filter((part) => part !== "");
  const seen = /* @__PURE__ */ new Set();
  for (const part of parts) {
    let url;
    try {
      url = new URL(part);
    } catch {
      throw new InputError(
        `"${part.slice(0, 80)}" is not an address. Give a full http or https page address.`
      );
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new InputError(`"${url.protocol}" addresses are not scanned: use http or https.`);
    }
    if (url.username !== "" || url.password !== "") {
      throw new InputError("A page address with a user name or password in it is never scanned.");
    }
    seen.add(url.href);
  }
  if (seen.size === 0)
    throw new InputError("Give the page to scan in `url` (or several in `urls`).");
  if (seen.size > MAX_URLS) throw new InputError(`At most ${String(MAX_URLS)} pages in one run.`);
  return [...seen];
}
function integer(env, name, fallback, min, max) {
  const raw = input(env, name);
  if (raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new InputError(`\`${name}\` is a whole number from ${String(min)} to ${String(max)}.`);
  }
  return value;
}
function readInputs(env) {
  const urls = pages(env);
  const apiKey = input(env, "api_key");
  if (!API_KEY_PATTERN.test(apiKey)) {
    throw new InputError(
      "`api_key` must be an API key from your account page (it begins with arb_). Keep it in a repository secret."
    );
  }
  const rawOrigin = input(env, "api_url") || DEFAULT_ORIGIN;
  let origin;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new InputError(
      "`api_url` must be the address of your Arablyzer, such as https://arablyzer.com."
    );
  }
  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    throw new InputError("`api_url` must start with https://.");
  }
  if (origin.username !== "" || origin.password !== "") {
    throw new InputError("`api_url` takes no user name or password.");
  }
  const failOn = (input(env, "fail_on") || "none").toLowerCase();
  if (failOn !== "critical" && failOn !== "serious" && failOn !== "none") {
    throw new InputError("`fail_on` is critical, serious or none.");
  }
  const wait = (input(env, "wait") || "true").toLowerCase();
  if (wait !== "true" && wait !== "false") throw new InputError("`wait` is true or false.");
  const lang = (input(env, "lang") || "en").toLowerCase();
  if (lang !== "ar" && lang !== "en") throw new InputError("`lang` is ar or en.");
  const workspace = resolve(env.GITHUB_WORKSPACE ?? process.cwd());
  const sarifDir = resolve(workspace, input(env, "sarif_dir") || "arablyzer-sarif");
  const inside = relative(workspace, sarifDir);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
    throw new InputError("`sarif_dir` must be a folder inside the workspace.");
  }
  return {
    urls,
    apiKey,
    origin: origin.origin + (origin.pathname === "/" ? "" : origin.pathname.replace(/\/+$/, "")),
    failOn,
    wait: wait === "true",
    lang,
    sarifDir,
    timeoutMs: integer(env, "timeout_seconds", 300, 30, 1800) * 1e3,
    maxIssues: integer(env, "max_issues", 10, 1, 50)
  };
}

// src/sarif.ts
var SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";
var LEVELS = {
  critical: "error",
  serious: "error",
  moderate: "warning",
  minor: "note",
  info: "note"
};
function uriOf(candidate, pageUrl) {
  if (candidate === void 0) return pageUrl;
  try {
    return new URL(candidate, pageUrl).href;
  } catch {
    return pageUrl;
  }
}
function categoryOf(pageUrl) {
  let host = "page";
  let path = "";
  try {
    const url = new URL(pageUrl);
    host = url.host;
    path = url.pathname.replace(/\/+$/, "");
  } catch {
  }
  return `arablyzer/${host}${path.replace(/[^A-Za-z0-9._~/-]/g, "-")}/`;
}
function toSarif(report, options) {
  const pageUrl = report.target.finalUrl ?? report.target.url;
  const known = new Map(report.rules.map((rule) => [rule.id, rule]));
  const rules = [];
  const indexOf = /* @__PURE__ */ new Map();
  const ruleFor = (ruleId, severity, fallback) => {
    const found = indexOf.get(ruleId);
    if (found !== void 0) return found;
    const rule = known.get(ruleId);
    const title = rule?.title[options.lang] ?? fallback;
    const helpUri = rulePageUrl(options.origin, options.lang, ruleId);
    const wcag = (rule?.wcag ?? []).map((criterion) => `wcag-${criterion}`);
    rules.push({
      id: ruleId,
      shortDescription: { text: title },
      helpUri,
      help: { text: `${title}
${helpUri}`, markdown: `[${title}](${helpUri})` },
      defaultConfiguration: { level: LEVELS[rule?.severity ?? severity] },
      properties: {
        tags: ["arablyzer", ...rule === void 0 ? [] : [rule.category], ...wcag],
        precision: "high"
      }
    });
    indexOf.set(ruleId, rules.length - 1);
    return rules.length - 1;
  };
  const results = report.findings.map((finding) => {
    const { evidence } = finding;
    const message = finding.message[options.lang];
    const physicalLocation = {
      artifactLocation: { uri: uriOf(evidence.url, pageUrl) },
      ...evidence.location === void 0 ? {} : {
        region: {
          startLine: evidence.location.line,
          ...evidence.location.column === void 0 ? {} : { startColumn: evidence.location.column },
          ...evidence.snippet === void 0 ? {} : { snippet: { text: evidence.snippet } }
        }
      }
    };
    return {
      ruleId: finding.ruleId,
      ruleIndex: ruleFor(finding.ruleId, finding.severity, message),
      level: LEVELS[finding.severity],
      message: { text: message },
      locations: [
        {
          physicalLocation,
          ...evidence.selector === void 0 ? {} : { logicalLocations: [{ name: evidence.selector, kind: "element" }] }
        }
      ],
      partialFingerprints: { "arablyzer/v1": finding.fingerprint },
      properties: {
        severity: finding.severity,
        ...evidence.engines === void 0 ? {} : { engines: [...evidence.engines] }
      }
    };
  });
  return {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Arablyzer",
            semanticVersion: report.generator.version,
            informationUri: options.origin,
            rules
          }
        },
        automationDetails: { id: categoryOf(report.target.url) },
        results,
        properties: {
          score: report.score.overall,
          scanUrl: report.target.url,
          reportUrl: options.reportUrl
        }
      }
    ]
  };
}

// src/summary.ts
var MAX_CELL = 120;
function escapeMarkdown(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  const short = flat.length > MAX_CELL ? `${flat.slice(0, MAX_CELL - 1)}…` : flat;
  return short.replace(/[\\`*_{}[\]()#+!|<>~&]/g, (char) => `\\${char}`);
}
function codeSpan(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  const short = flat.length > MAX_CELL ? `${flat.slice(0, MAX_CELL - 1)}…` : flat;
  return `\`${short.replace(/`/g, "'").replace(/\|/g, "\\|")}\``;
}
function pageSection(result, options) {
  const t = INTEGRATIONS_UI[options.lang].action;
  const report = result.report;
  const lines = [`## ${t.heading}: ${codeSpan(result.url)}`, ""];
  const score = report.score.overall;
  lines.push(score === null ? t.noScore : t.score(score), "");
  if (report.score.partial) lines.push(`> ${t.partial}`, "");
  const by = report.summary.bySeverity;
  lines.push(`**${t.counts}**`, "");
  lines.push(`| ${SEVERITIES.map((s) => t.severity[s]).join(" | ")} |`);
  lines.push(`|${SEVERITIES.map(() => " ---: ").join("|")}|`);
  lines.push(`| ${SEVERITIES.map((s) => String(by[s])).join(" | ")} |`, "");
  const issues = groupIssues(report);
  if (issues.length === 0) {
    lines.push(t.noIssues, "");
  } else {
    lines.push(`**${t.topIssues}**`, "");
    lines.push(`| ${t.columns.join(" | ")} |`, `| --- | --- | ---: | --- |`);
    for (const issue of issues.slice(0, options.maxIssues)) {
      const link = `[${escapeMarkdown(issue.ruleId)}](${rulePageUrl(options.origin, options.lang, issue.ruleId)})`;
      const example = issue.example?.selector ?? issue.example?.url ?? "";
      lines.push(
        `| ${link}<br>${escapeMarkdown(issue.message[options.lang])} | ${t.severity[issue.severity]} | ${String(issue.occurrences)} | ${example === "" ? "" : codeSpan(example)} |`
      );
    }
    lines.push("");
    if (issues.length > options.maxIssues) {
      lines.push(t.moreIssues(issues.length - options.maxIssues), "");
    }
  }
  if (options.failOn !== "none") {
    const word = t.severity[options.failOn].toLowerCase();
    lines.push(
      `**${result.gateCount > 0 ? t.gate.failed(result.gateCount, word) : t.gate.passed(word)}**`,
      ""
    );
  }
  lines.push(`[${t.fullReport}](${result.reportUrl})`, "");
  return lines;
}
function renderSummary(outcomes, options) {
  const t = INTEGRATIONS_UI[options.lang].action;
  const lines = [];
  for (const outcome of outcomes) {
    if (outcome.kind === "report") {
      lines.push(...pageSection(outcome.result, options));
    } else if (outcome.kind === "started") {
      lines.push(
        `## ${t.heading}: ${codeSpan(outcome.url)}`,
        "",
        t.started,
        "",
        `[${t.fullReport}](${outcome.reportUrl})`,
        ""
      );
    } else {
      const { problem } = outcome;
      lines.push(
        `## ${t.errorHeading}: ${codeSpan(problem.url)}`,
        "",
        `> ${escapeMarkdown(problem.problem)}${problem.retryAfterSeconds === void 0 ? "" : ` ${t.retryAfter(problem.retryAfterSeconds)}`}`,
        ""
      );
    }
  }
  lines.push(`<sub>${t.footer}</sub>`);
  const body = lines.join("\n");
  return options.lang === "ar" ? `<div dir="rtl">

${body}

</div>
` : `${body}
`;
}

// src/version.ts
var VERSION = "0.1.0";

// src/run.ts
var slugOf = (url) => {
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname}`.replace(/[^A-Za-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
};
var PROBLEMS = [
  "unauthorized",
  "plan_limit",
  "rate_limited",
  "blocked_target",
  "invalid_url",
  "invalid_request",
  "accounts_off",
  "network",
  "unavailable",
  "timeout",
  "scan_failed",
  "bad_response"
];
function problemKey(error) {
  const code = error instanceof ApiError ? error.code : "unavailable";
  return PROBLEMS.includes(code) ? code : "unavailable";
}
async function runAction(deps) {
  const sink = deps.sink ?? runnerSink(deps.env, deps.write ?? ((text) => process.stdout.write(text)));
  let inputs;
  try {
    inputs = readInputs(deps.env);
  } catch (error) {
    if (error instanceof InputError) {
      sink.error(error.message);
      return 1;
    }
    throw error;
  }
  sink.mask(inputs.apiKey);
  const t = INTEGRATIONS_UI[inputs.lang].action;
  const client = createApiClient({
    baseUrl: inputs.origin,
    apiKey: inputs.apiKey,
    fetcher: deps.fetcher,
    headers: { "user-agent": `arablyzer-action/${VERSION}` }
  });
  const scanOne = async (url, index) => {
    try {
      const started = await client.startScan(url);
      const reportUrl = absolute(inputs.origin, started.links.page);
      sink.info(
        `${url}: scan ${started.id}${started.reused ? " (reused, scanned in the last ten minutes)" : ""}`
      );
      if (!inputs.wait) return { kind: "started", url, reportUrl };
      const scan = await waitForScan({
        client,
        scanId: started.id,
        first: started,
        timeoutMs: inputs.timeoutMs,
        sleep: deps.sleep,
        now: deps.now
      });
      if (scan.state === "failed") throw new ApiError("scan_failed", "The scan failed.", 0);
      const report = await client.getReport(scan.id);
      const gateCount = countAtOrAbove(report.summary.bySeverity, inputs.failOn);
      const file = `${inputs.sarifDir}/${String(index + 1).padStart(2, "0")}-${slugOf(url)}.sarif`;
      await deps.writeFile(
        file,
        `${JSON.stringify(toSarif(report, { origin: inputs.origin, lang: inputs.lang, reportUrl }), null, 2)}
`
      );
      sink.info(`${url}: score ${String(report.score.overall ?? "none")}, report ${reportUrl}`);
      return { kind: "report", result: { url, reportUrl, report, gateCount } };
    } catch (error) {
      const key = problemKey(error);
      sink.error(`${url}: ${t.problems[key]}`);
      return {
        kind: "problem",
        problem: {
          url,
          problem: t.problems[key],
          ...error instanceof ApiError && error.retryAfterSeconds !== void 0 ? { retryAfterSeconds: error.retryAfterSeconds } : {}
        }
      };
    }
  };
  const outcomes = await Promise.all(inputs.urls.map(scanOne));
  sink.summary(
    renderSummary(outcomes, {
      origin: inputs.origin,
      lang: inputs.lang,
      maxIssues: inputs.maxIssues,
      failOn: inputs.failOn
    })
  );
  const reports = outcomes.flatMap((o) => o.kind === "report" ? [o] : []);
  const scores = Object.fromEntries(
    reports.map((o) => [o.result.url, o.result.report.score.overall])
  );
  const numeric = Object.values(scores).filter((s) => s !== null);
  const totals = Object.fromEntries(
    SEVERITIES.map((s) => [
      s,
      reports.reduce((sum, o) => sum + o.result.report.summary.bySeverity[s], 0)
    ])
  );
  const failedGate = reports.some((o) => o.result.gateCount > 0);
  const hadProblem = outcomes.some((o) => o.kind === "problem");
  const result = hadProblem ? "error" : failedGate ? "fail" : inputs.wait ? "pass" : "started";
  sink.output("score", numeric.length === 0 ? "" : String(Math.min(...numeric)));
  sink.output("scores", JSON.stringify(scores));
  sink.output("findings", JSON.stringify(totals));
  sink.output(
    "report_urls",
    JSON.stringify(
      outcomes.flatMap(
        (o) => o.kind === "report" ? [o.result.reportUrl] : o.kind === "started" ? [o.reportUrl] : []
      )
    )
  );
  sink.output("sarif_dir", reports.length === 0 ? "" : inputs.sarifDir);
  sink.output("result", result);
  if (inputs.failOn !== "none") {
    const word = t.severity[inputs.failOn].toLowerCase();
    for (const o of reports) {
      if (o.result.gateCount > 0)
        sink.error(`${o.result.url}: ${t.gate.failed(o.result.gateCount, word)}`);
    }
  }
  return result === "pass" || result === "started" ? 0 : 1;
}

// src/main.ts
process.exitCode = await runAction({
  env: process.env,
  fetcher: (input2, init) => fetch(input2, init),
  sleep: (ms) => new Promise((resolve2) => setTimeout(resolve2, ms)),
  now: () => Date.now(),
  writeFile: async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  }
});
