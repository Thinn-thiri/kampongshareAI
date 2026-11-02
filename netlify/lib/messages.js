// @ts-check
// The server's own words in English, 简体中文 and Bahasa Melayu (REQUIREMENTS.md "Languages"):
// the chat's fixed replies and template sentences, and the match-items reasons.
// Same keys and {placeholders} in every language — node scripts/check-i18n.js checks this.
// What people wrote (item names, units, area names) is put in as it is, never translated.

/** @typedef {'en' | 'zh' | 'ms'} Lang */

/** @type {Lang[]} */
export const LANGS = ["en", "zh", "ms"];

/** For dates in each language. */
export const LOCALES = /** @type {Record<Lang, string>} */ ({ en: "en-SG", zh: "zh-SG", ms: "ms-SG" });

/** How the AI is told which language to write in. */
export const LANGUAGE_NAMES = /** @type {Record<Lang, string>} */ ({
  en: "simple English",
  zh: "Simplified Chinese (简体中文) as used in Singapore — simplified characters only, never traditional characters",
  ms: "Malay (Bahasa Melayu), as used in Singapore",
});

export const MESSAGES = /** @type {Record<Lang, Record<string, string>>} */ ({
  en: {
    personal:
      "I can't share anyone's personal information. Organizations can see a donor's or volunteer's contact details only after they make an offer or apply.",
    offTopic: "I can only help with KampongShare — donating, volunteering, requests and events.",
    unavailable: "I can't answer typed questions right now — try one of the suggested questions.",
    notSure: "I'm not sure — see How it works.",
    privacyFallback: "You can read how we handle your information in our Privacy Notice.",
    ownAccount: "The chat can't see your account, but you'll find it here once you're logged in:",
    ownPassword:
      "The chat can't see your account, and nobody can see your password — not even us. If you've forgotten it, the site can't reset passwords yet: please email us using the address in the Privacy Notice.",
    howItWorks: "How it works",
    privacyNotice: "Privacy Notice",
    myOffers: "My offers",
    myApplications: "My applications",
    myOrganization: "My organization",
    myProfile: "My profile",
    or: " or ",
    noEventsSoon: "There are no volunteer events in the next two weeks yet. Check back soon!",
    eventsNotInArea: "There are no events in {areas} soon, but here's what's coming up: ",
    eventsComing: "Here are the volunteer events coming up in the next two weeks:",
    eventsOne: "Here is the volunteer event coming up in the next two weeks:",
    eventsMany: "Here are the {count} volunteer events coming up in the next two weeks:",
    noOpenRequests: "There are no open requests right now.",
    nothingLikeThat: "Nothing like that is needed right now, but here's what is most needed: ",
    neededNow: "Here's what's needed right now:",
    areasPick: "These areas have open requests right now. Pick one:",
    endingSoon: "These items are needed before their deadline in the next 7 days:",
    endingNone: "No requests end in the next 7 days.",
    areaNeeded: "Here's what's needed in {area} right now:",
    areaNone: "Nothing is needed in {area} right now.",
    mostNeeded: "Here are the {count} most needed items right now:",
    reasonNeeds: "Needs {count} more {unit} of {item}",
    dueToday: "due today",
    dueInOne: "due in {days} day",
    dueInMany: "due in {days} days",
    urgencyCritical: "critical urgency",
    urgencyHigh: "high urgency",
    nearYou: "near you ({area})",
    separator: " · ",
    // Pinny's agent mode (chat-insights "agent"): the "What Pinny did" steps, written by code from real results
    agentFound: "Here's what I found. Tap a card to see more.",
    stepSearchRequests: "Searched open requests · Found {count}",
    stepSearchRequestsIn: "Searched requests in {area} · Found {count}",
    stepGetRequest: "Looked at “{title}”",
    stepMatch: "Matched what you can give · {count} matches",
    stepSearchEvents: "Checked upcoming events · Found {count}",
    stepSearchEventsSpots: "Checked events with spots left · Found {count}",
    stepGetEvent: "Checked “{title}” · {spots}",
    spotsLeftOne: "1 spot left",
    spotsLeftMany: "{count} spots left",
    spotsNone: "full",
    spotsAny: "no limit",
    stepGetOrganization: "Looked up {name}",
    stepHelp: "Read the help pages",
    stepOffer: "Prepared an offer: {quantity} {unit} of {item}",
    stepCheckConflict: "Check found a conflict: {explanation}",
    stepCheckFixed: "check found a conflict → fixed",
    stepChecked: "checked by AI ✓",
    stepNotChecked: "The AI check couldn't run, so no draft was made",
    stepCheckAsk: "Check needs an answer: {question}",
    stepApplication: "Prepared an application for “{title}”",
    stepMessage: "Drafted a message to {name}",
    stepPage: "Found the page for you",
    stepRefused: "Checked, but couldn't prepare that",
    stepFailed: "Couldn't look that up",
    pageNeeds: "Browse needs",
    pageEventsMap: "Events map",
    pageEvent: "Open the event",
    pageOrg: "Open the organization",
    pageMyOffers: "My offers",
    pageMyApplications: "My applications",
    pageProfile: "My profile",
  },
  zh: {
    personal: "我不能透露任何人的个人信息。只有在捐赠者或志愿者提出捐赠或报名后，机构才能看到他们的联系方式。",
    offTopic: "我只能回答与 KampongShare 有关的问题——捐赠、当志愿者、需求和活动。",
    unavailable: "我现在无法回答输入的问题——请试试下面的建议问题。",
    notSure: "我不太确定——请看“如何运作”。",
    privacyFallback: "您可以在我们的隐私声明中了解我们如何处理您的信息。",
    ownAccount: "聊天助手看不到您的账户，但您登录后可以在这里找到：",
    ownPassword:
      "聊天助手看不到您的账户，也没有人能看到您的密码——包括我们。如果您忘记了密码，网站目前还无法重设密码：请用隐私声明里的电邮地址联系我们。",
    howItWorks: "如何运作",
    privacyNotice: "隐私声明",
    myOffers: "我的捐赠",
    myApplications: "我的报名",
    myOrganization: "我的机构",
    myProfile: "我的资料",
    or: "或",
    noEventsSoon: "未来两周还没有志愿活动。请稍后再来看看！",
    eventsNotInArea: "{areas}近期没有活动，不过以下是即将举行的活动：",
    eventsComing: "以下是未来两周即将举行的志愿活动：",
    eventsOne: "以下是未来两周即将举行的志愿活动：",
    eventsMany: "以下是未来两周即将举行的 {count} 个志愿活动：",
    noOpenRequests: "目前没有开放中的需求。",
    nothingLikeThat: "目前不需要这类物品，不过以下是最需要的：",
    neededNow: "以下是目前需要的物品：",
    areasPick: "以下地区目前有开放中的需求，请选择一个：",
    endingSoon: "以下物品需要在未来 7 天内的截止日期前送到：",
    endingNone: "未来 7 天内没有截止的需求。",
    areaNeeded: "以下是 {area} 目前需要的物品：",
    areaNone: "{area} 目前没有需要的物品。",
    mostNeeded: "以下是目前最需要的 {count} 项物品：",
    reasonNeeds: "还需要 {count} {unit} {item}",
    dueToday: "今天截止",
    dueInOne: "{days} 天后截止",
    dueInMany: "{days} 天后截止",
    urgencyCritical: "非常紧急",
    urgencyHigh: "高度紧急",
    nearYou: "离您近（{area}）",
    separator: " · ",
    // Pinny's agent mode (chat-insights "agent"): the "What Pinny did" steps, written by code from real results
    agentFound: "这是我找到的内容。点卡片可以看更多。",
    stepSearchRequests: "搜索了开放的请求 · 找到 {count} 个",
    stepSearchRequestsIn: "搜索了{area}的请求 · 找到 {count} 个",
    stepGetRequest: "查看了“{title}”",
    stepMatch: "匹配了你可以捐的物品 · {count} 个结果",
    stepSearchEvents: "查看了即将举行的活动 · 找到 {count} 个",
    stepSearchEventsSpots: "查看了还有名额的活动 · 找到 {count} 个",
    stepGetEvent: "查看了“{title}” · {spots}",
    spotsLeftOne: "剩 1 个名额",
    spotsLeftMany: "剩 {count} 个名额",
    spotsNone: "已满",
    spotsAny: "不限人数",
    stepGetOrganization: "查看了{name}",
    stepHelp: "读了帮助内容",
    stepOffer: "准备了捐赠：{quantity} {unit} {item}",
    stepCheckConflict: "检查发现冲突：{explanation}",
    stepCheckFixed: "检查发现冲突 → 已修正",
    stepChecked: "已由 AI 检查 ✓",
    stepNotChecked: "AI 检查无法运行，所以没有准备草稿",
    stepCheckAsk: "检查需要你回答：{question}",
    stepApplication: "准备了“{title}”的报名",
    stepMessage: "给{name}写了消息草稿",
    stepPage: "找到了你要的页面",
    stepRefused: "查看了，但无法准备",
    stepFailed: "无法查到",
    pageNeeds: "浏览需求",
    pageEventsMap: "活动地图",
    pageEvent: "打开活动",
    pageOrg: "打开机构页面",
    pageMyOffers: "我的捐赠",
    pageMyApplications: "我的报名",
    pageProfile: "我的资料",
  },
  ms: {
    personal:
      "Saya tidak boleh berkongsi maklumat peribadi sesiapa. Pertubuhan hanya dapat melihat butiran hubungan penderma atau sukarelawan selepas mereka membuat tawaran atau memohon.",
    offTopic: "Saya hanya boleh membantu tentang KampongShare — menderma, menjadi sukarelawan, permintaan dan acara.",
    unavailable: "Saya tidak dapat menjawab soalan yang ditaip sekarang — cuba salah satu soalan cadangan.",
    notSure: "Saya kurang pasti — lihat Cara ia berfungsi.",
    privacyFallback: "Anda boleh baca cara kami mengendalikan maklumat anda dalam Notis Privasi kami.",
    ownAccount: "Sembang ini tidak dapat melihat akaun anda, tetapi anda boleh menemuinya di sini selepas log masuk:",
    ownPassword:
      "Sembang ini tidak dapat melihat akaun anda, dan tiada sesiapa yang dapat melihat kata laluan anda — termasuk kami. Jika anda terlupa, laman ini belum boleh menetapkan semula kata laluan: sila e-mel kami menggunakan alamat dalam Notis Privasi.",
    howItWorks: "Cara ia berfungsi",
    privacyNotice: "Notis Privasi",
    myOffers: "Tawaran saya",
    myApplications: "Permohonan saya",
    myOrganization: "Pertubuhan saya",
    myProfile: "Profil saya",
    or: " atau ",
    noEventsSoon: "Belum ada acara sukarelawan dalam dua minggu akan datang. Sila semak semula nanti!",
    eventsNotInArea: "Tiada acara di {areas} dalam masa terdekat, tetapi ini acara yang akan datang: ",
    eventsComing: "Ini acara sukarelawan dalam dua minggu akan datang:",
    eventsOne: "Ini acara sukarelawan dalam dua minggu akan datang:",
    eventsMany: "Ini {count} acara sukarelawan dalam dua minggu akan datang:",
    noOpenRequests: "Tiada permintaan terbuka buat masa ini.",
    nothingLikeThat: "Barang seperti itu tidak diperlukan sekarang, tetapi ini yang paling diperlukan: ",
    neededNow: "Ini yang diperlukan sekarang:",
    areasPick: "Kawasan ini ada permintaan terbuka sekarang. Pilih satu:",
    endingSoon: "Barang ini diperlukan sebelum tarikh akhirnya dalam 7 hari akan datang:",
    endingNone: "Tiada permintaan yang tamat dalam 7 hari akan datang.",
    areaNeeded: "Ini yang diperlukan di {area} sekarang:",
    areaNone: "Tiada apa yang diperlukan di {area} sekarang.",
    mostNeeded: "Ini {count} barang yang paling diperlukan sekarang:",
    reasonNeeds: "Perlu {count} {unit} lagi {item}",
    dueToday: "tamat hari ini",
    dueInOne: "tamat dalam {days} hari",
    dueInMany: "tamat dalam {days} hari",
    urgencyCritical: "sangat mendesak",
    urgencyHigh: "mendesak",
    nearYou: "dekat anda ({area})",
    separator: " · ",
    // Pinny's agent mode (chat-insights "agent"): the "What Pinny did" steps, written by code from real results
    agentFound: "Ini yang saya jumpa. Tekan kad untuk lihat lebih lanjut.",
    stepSearchRequests: "Cari permintaan terbuka · Jumpa {count}",
    stepSearchRequestsIn: "Cari permintaan di {area} · Jumpa {count}",
    stepGetRequest: "Lihat “{title}”",
    stepMatch: "Padankan apa yang anda boleh beri · {count} padanan",
    stepSearchEvents: "Semak acara akan datang · Jumpa {count}",
    stepSearchEventsSpots: "Semak acara yang masih ada tempat · Jumpa {count}",
    stepGetEvent: "Semak “{title}” · {spots}",
    spotsLeftOne: "tinggal 1 tempat",
    spotsLeftMany: "tinggal {count} tempat",
    spotsNone: "penuh",
    spotsAny: "tiada had",
    stepGetOrganization: "Lihat {name}",
    stepHelp: "Baca halaman bantuan",
    stepOffer: "Sediakan tawaran: {quantity} {unit} {item}",
    stepCheckConflict: "Semakan menemui percanggahan: {explanation}",
    stepCheckFixed: "semakan menemui percanggahan → dibetulkan",
    stepChecked: "disemak oleh AI ✓",
    stepNotChecked: "Semakan AI tidak dapat dijalankan, jadi tiada draf dibuat",
    stepCheckAsk: "Semakan perlukan jawapan: {question}",
    stepApplication: "Sediakan permohonan untuk “{title}”",
    stepMessage: "Draf mesej kepada {name}",
    stepPage: "Jumpa halaman untuk anda",
    stepRefused: "Sudah semak, tetapi tidak dapat sediakan",
    stepFailed: "Tidak dapat semak",
    pageNeeds: "Lihat keperluan",
    pageEventsMap: "Peta acara",
    pageEvent: "Buka acara",
    pageOrg: "Buka organisasi",
    pageMyOffers: "Tawaran saya",
    pageMyApplications: "Permohonan saya",
    pageProfile: "Profil saya",
  },
});

/**
 * The server's text for a key in a language (English if missing), with {name} placeholders filled in.
 * @param {Lang} lang
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function serverT(lang, key, params = {}) {
  const text = MESSAGES[lang]?.[key] ?? MESSAGES.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
}

/** @param {unknown} value @returns {value is Lang} */
export function isLang(value) {
  return value === "en" || value === "zh" || value === "ms";
}

/** Common Traditional characters and their Simplified forms (same order), for toSimplified(). */
const TRADITIONAL = "兩個於舉將來願動種請組織幫給這們為會說時間後還與區單東資戶帳號碼電郵點開關機構隊義務參報歡謝讓問題從數準備寫細節認證確實現見學書衛嬰兒條雙襪庫錢應該經過進選擇鄰島週裡裏麼樣嗎對幾處發愛獻贈歲齡樂顧護藥飯麵糧飲鹽紙筆鉛課師長門線網頁連結鐘樓遞錄員達聯繫絡費買賣貨帶狀態據壓傳統輕鬆熱氣溫灣臺園範圍際協辦設計劃歷記錯誤須雖雜習慣訊歸屬類別視聽讀試驗標優價總餘盡滿衆眾換獲隨闆鬧慶團體窮貧濟災難誰緊產麥頭湯懷窩鈕濱倉級豐稱華環補適業專場張塊醫療響變話語誌剛異隻邊嚴寶勞續維編練紅約終絕輛車運載輸復億萬聖獨夠壞慮擔興創戲殘涼淨滅燈爭牽獎畫盤穩競籃綠緣縣聲膠艱薦蘋裝製覺觀訂訪評詢調談諮謹讚貝負貢貼賽贊趕躍輔轉遠遲鄉銷鍋鎮閱闊陳陽階雞離雲靜韓項順預領頻風飛養餅館髮魚鮮鳥麗黃齊龍";
const SIMPLIFIED = "两个于举将来愿动种请组织帮给这们为会说时间后还与区单东资户账号码电邮点开关机构队义务参报欢谢让问题从数准备写细节认证确实现见学书卫婴儿条双袜库钱应该经过进选择邻岛周里里么样吗对几处发爱献赠岁龄乐顾护药饭面粮饮盐纸笔铅课师长门线网页连结钟楼递录员达联系络费买卖货带状态据压传统轻松热气温湾台园范围际协办设计划历记错误须虽杂习惯讯归属类别视听读试验标优价总余尽满众众换获随板闹庆团体穷贫济灾难谁紧产麦头汤怀窝钮滨仓级丰称华环补适业专场张块医疗响变话语志刚异只边严宝劳续维编练红约终绝辆车运载输复亿万圣独够坏虑担兴创戏残凉净灭灯争牵奖画盘稳竞篮绿缘县声胶艰荐苹装制觉观订访评询调谈咨谨赞贝负贡贴赛赞赶跃辅转远迟乡销锅镇阅阔陈阳阶鸡离云静韩项顺预领频风飞养饼馆发鱼鲜鸟丽黄齐龙";

/**
 * A safety net for AI text in Chinese: the model is told to use Simplified characters, but sometimes
 * slips into Traditional ones (兩個 → 两个). Only common characters are covered.
 * @param {string} text
 * @returns {string}
 */
export function toSimplified(text) {
  return [...text]
    .map((char) => {
      const at = TRADITIONAL.indexOf(char);
      return at === -1 ? char : SIMPLIFIED[at];
    })
    .join("");
}

/** Common Malay and English words, to tell which language a typed question is in. */
const MALAY_WORDS = new Set(
  ("saya apa bagaimana macam mana boleh derma menderma sumbangan sukarelawan nak hendak mahu untuk dan di ke dengan ini itu " +
    "ada tidak tak akaun kata laluan cara bila siapa kenapa mengapa barang acara keperluan perlu diperlukan minggu kawasan kami " +
    "anda awak berapa lupa padam tukar daftar masuk keluar bantuan makanan pakaian bayi pertubuhan permintaan tawaran sekarang " +
    "apakah adakah yang ialah bagi kat dekat sini").split(" "),
);
const ENGLISH_WORDS = new Set(
  ("the how what where when who which why i my is are am do does did can could to for of in on and or need needed needs " +
    "donate donating volunteer volunteering account password event events please any there you your this that with about").split(" "),
);

/**
 * The language a typed question is written in: Chinese characters → zh, mostly Malay words → ms,
 * English words → en; otherwise the language chosen on the site.
 * @param {string} text
 * @param {Lang} fallback
 * @returns {Lang}
 */
export function questionLang(text, fallback) {
  if (/[㐀-鿿]/.test(text)) return "zh";
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const malay = words.filter((word) => MALAY_WORDS.has(word)).length;
  const english = words.filter((word) => ENGLISH_WORDS.has(word)).length;
  if (malay > english) return "ms";
  if (english > 0) return "en";
  return fallback;
}
