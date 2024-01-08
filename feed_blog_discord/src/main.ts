type DiscordWebhookPayload = {
  content: string;
};

const techRss2Urls: Array<string> = [
  "https://zenn.dev/feed",
  "https://engineering.dena.com/index.xml",
  "https://knowledge.sakura.ad.jp/feed/",
  "https://techblog.lycorp.co.jp/ja/feed/index.xml",
  "https://developers.cyberagent.co.jp/blog/feed/",
  "https://labs.gree.jp/blog/feed/",
  "https://techlife.cookpad.com/rss",
  // "https://engineering.mercari.com/blog/feed.xml",
  "https://moneyforward-dev.jp/rss",
  "https://github.blog/jp/feed/",
  "https://techblog.zozo.com/rss",
  // "https://b.hatena.ne.jp/hotentry/it.rss",
  "https://user-first.ikyu.co.jp/rss",
  "https://tech.gunosy.io/rss",
  "https://tech.uzabase.com/rss",
  "https://codezine.jp/rss/new/20/index.xml",
  "https://medium.com/feed/mixi-developers",
  "https://medium.com/feed/eureka-engineering",
];
const techAtomUrls: Array<string> = [
  "https://gihyo.jp/feed/atom",
  "https://developer.smartnews.com/blog/feed",
  "https://www.publickey1.jp/atom.xml",
];

const businessRss2Urls: Array<string> = ["https://techcrunch.com/feed/"];
const businessAtomUrls: Array<string> = [];

const main = () => {
  sendFeedToDiscord("DISCORD_WEBHOOK_URL_TECH", techRss2Urls, techAtomUrls);
  sendFeedToDiscord(
    "DISCORD_WEBHOOK_URL_BUSINESS",
    businessRss2Urls,
    businessAtomUrls
  );
};

const sendFeedToDiscord = async (
  key: string,
  rss2Urls,
  atomUrls: Array<string>
): Promise<void> => {
  const webhookUrl = PropertiesService.getScriptProperties().getProperty(key);
  if (!webhookUrl) return;

  const promises = [
    ...rss2Urls.map(fetchRssFeeds),
    ...atomUrls.map(fetchAtomFeeds),
  ];
  const feeds = await Promise.all(promises);

  feeds
    .filter((s) => s)
    .map((feed) => {
      try {
        postToDiscord(webhookUrl, feed);
      } catch (e) {
        postToDiscord(
          webhookUrl,
          e.message + "\n===========================\n"
        );
      }
      Utilities.sleep(1000);
    });
};

const postToDiscord = (webhookUrl: string, content: string): void => {
  const payload: DiscordWebhookPayload = {
    content: "@silent " + content,
  };
  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
  };
  UrlFetchApp.fetch(webhookUrl, options);
};

const fetchRssFeeds = async (url: string): Promise<string> => {
  try {
    const response = UrlFetchApp.fetch(url);
    const xml = response.getContentText();
    const document = XmlService.parse(xml);
    const items = document
      .getRootElement()
      .getChild("channel")
      .getChildren("item");
    const newFeeds = items.filter((item) =>
      isNewerThanOneHour(item.getChildText("pubDate"))
    );
    if (!newFeeds.length) return "";
    return (
      `## New Posts from ${url}\n\n` +
      newFeeds
        .map(
          (feed) =>
            `[${feed.getChildText("title")}](<${feed.getChildText("link")}>)`
        )
        .join("\n") +
      "\n===========================\n"
    );
  } catch {
    return (
      `feedの取得に失敗しました ${url}` + "\n===========================\n"
    );
  }
};

const fetchAtomFeeds = async (url: string): Promise<string> => {
  try {
    const response = UrlFetchApp.fetch(url);
    const xml = response.getContentText();
    const document = XmlService.parse(xml);
    const atom = XmlService.getNamespace("http://www.w3.org/2005/Atom");
    const items = document.getRootElement().getChildren("entry", atom);
    const newFeeds = items.filter((item) =>
      isNewerThanOneHour(
        item.getChildText("published", atom) ||
          item.getChildText("updated", atom)
      )
    );
    if (!newFeeds.length) return "";
    return (
      `## New Posts from ${url}\n\n` +
      newFeeds
        .map((feed) => {
          const title = feed.getChildText("title", atom);
          const linkElement = feed.getChild("link", atom);
          const link = linkElement.getAttribute("href")
            ? linkElement.getAttribute("href").getValue()
            : linkElement.getText();

          return `[${title}](<${link}>)`;
        })
        .join("\n") +
      "\n===========================\n"
    );
  } catch {
    return (
      `feedの取得に失敗しました ${url}` + "\n===========================\n"
    );
  }
};
const isNewerThanOneHour = (dateString: string) => {
  const targetDate = new Date(dateString);
  const currentDate = new Date();
  const oneHourAgo = new Date(currentDate.getTime() - 60 * 60 * 1000);
  return targetDate > oneHourAgo;
};
