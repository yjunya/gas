type DiscordWebhookPayload = {
  flags: number;
  content: string;
};

type FeedKind = "RSS 1.0" | "RSS 2.0" | "Atom";

type FetchResult = {
  kind: FeedKind;
  url: string;
  root: GoogleAppsScript.XML_Service.Element;
};

const techUrls: Array<string> = [
  "https://zenn.dev/feed",
  "https://engineering.dena.com/index.xml",
  "https://knowledge.sakura.ad.jp/feed/",
  "https://techblog.lycorp.co.jp/ja/feed/index.xml",
  "https://developers.cyberagent.co.jp/blog/feed/",
  "https://labs.gree.jp/blog/feed/",
  "https://techlife.cookpad.com/rss",
  "https://engineering.mercari.com/blog/feed.xml",
  "https://moneyforward-dev.jp/rss",
  "https://github.blog/jp/feed/",
  "https://techblog.zozo.com/rss",
  "https://b.hatena.ne.jp/hotentry/it.rss",
  "https://user-first.ikyu.co.jp/rss",
  "https://tech.gunosy.io/rss",
  "https://tech.uzabase.com/rss",
  "https://codezine.jp/rss/new/20/index.xml",
  "https://medium.com/feed/mixi-developers",
  "https://medium.com/feed/eureka-engineering",
  "https://gihyo.jp/feed/atom",
  "https://developer.smartnews.com/blog/feed",
  "https://www.publickey1.jp/atom.xml",
];

const businessUrls: Array<string> = ["https://techcrunch.com/feed/"];

const main = async () => {
  await sendFeedToDiscord({
    urls: techUrls,
    webhookKey: "DISCORD_WEBHOOK_URL_TECH",
  });
  await sendFeedToDiscord({
    urls: businessUrls,
    webhookKey: "DISCORD_WEBHOOK_URL_BUSINESS",
  });
};

const sendFeedToDiscord = async ({
  urls,
  webhookKey,
}: {
  urls: Array<string>;
  webhookKey: string;
}) => {
  const webhookURL =
    PropertiesService.getScriptProperties().getProperty(webhookKey);
  if (!webhookURL) return;
  const results = await Promise.allSettled(urls.map(fetchFeedWithType));
  const fulfilledResults = results.filter(
    (r) => r.status === "fulfilled"
  ) as PromiseFulfilledResult<FetchResult>[];
  const rejectedResults = results.filter(
    (r) => r.status === "rejected"
  ) as PromiseRejectedResult[];

  const messages = fulfilledResults.map(({ value }) => {
    switch (value.kind) {
      case "RSS 1.0":
        return parseRSS1(value);
      case "RSS 2.0":
        return parseRSS2(value);
      default:
        return parseAtom(value);
    }
  });

  [...messages, ...rejectedResults.map((r) => r.reason.message)]
    .filter((m) => m)
    .forEach((message) => {
      postToDiscord(webhookURL, message);
      Utilities.sleep(1000);
    });
};

const fetchFeedWithType = async (url: string): Promise<FetchResult> => {
  const root = (() => {
    try {
      const response = UrlFetchApp.fetch(url);
      const xml = XmlService.parse(response.getContentText());
      return xml.getRootElement();
    } catch {
      throw Error(`fetch error (${url})`);
    }
  })();

  if (
    root.getName() == "rss" &&
    root.getAttribute("version").getValue() == "2.0"
  ) {
    return { kind: "RSS 2.0", root, url };
  } else if (
    root.getName() == "RDF" &&
    root.getNamespace().getURI() ==
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  ) {
    return { kind: "RSS 1.0", root, url };
  } else if (
    root.getName() == "feed" &&
    root.getNamespace().getURI() == "http://www.w3.org/2005/Atom"
  ) {
    return { kind: "Atom", root, url };
  } else {
    throw Error(`unknown type (${url})`);
  }
};

const parseRSS2 = ({ root, url }: FetchResult): string => {
  try {
    const channel = root.getChild("channel");
    const title = channel.getChildText("title");
    const items = channel.getChildren("item");
    const newItems = items.filter((item) =>
      isNewerThanOneHour(item.getChildText("pubDate"))
    );
    if (!newItems.length) return "";
    return (
      `## [${title}](<${url}>)\n\n` +
      newItems
        .map(
          (item) =>
            `### ・[${item.getChildText("title")}](<${item.getChildText(
              "link"
            )}>)`
        )
        .join("\n") +
      "\n"
    );
  } catch {
    return `parse error (<${url}>)`;
  }
};

const parseRSS1 = ({ root, url }: FetchResult): string => {
  try {
    const channel = root.getChild("channel", root.getNamespace(""));
    const title = channel.getChildText("title", root.getNamespace(""));
    const items = root.getChildren(
      "item",
      XmlService.getNamespace("http://purl.org/rss/1.0/")
    );
    const newItems = items.filter((item) =>
      isNewerThanOneHour(
        item.getChildText(
          "date",
          XmlService.getNamespace("http://purl.org/dc/elements/1.1/")
        )
      )
    );
    if (!newItems.length) return "";
    return (
      `## [${title}](<${url}>)\n\n` +
      newItems
        .map(
          (item) =>
            `### ・[${item.getChildText(
              "title",
              XmlService.getNamespace("http://purl.org/rss/1.0/")
            )}](<${item.getChildText(
              "link",
              XmlService.getNamespace("http://purl.org/rss/1.0/")
            )}>)`
        )
        .join("\n") +
      "\n"
    );
  } catch {
    return `parse error (<${url}>)`;
  }
};

const parseAtom = ({ root, url }: FetchResult): string => {
  try {
    const title = root.getChildText("title", root.getNamespace());
    const items = root.getChildren("entry", root.getNamespace());
    const newItems = items.filter((item) =>
      isNewerThanOneHour(item.getChildText("updated", root.getNamespace()))
    );
    if (!newItems.length) return "";
    return (
      `## [${title}](<${url}>)\n\n` +
      newItems
        .map((item) => {
          const title = item.getChildText("title", root.getNamespace());
          const linkElement = item.getChild("link", root.getNamespace());
          const link = linkElement.getAttribute("href")
            ? linkElement.getAttribute("href").getValue()
            : linkElement.getText();

          return `### ・[${title}](<${link}>)`;
        })
        .join("\n") +
      "\n"
    );
  } catch {
    return `parse error (<${url}>)`;
  }
};

const isNewerThanOneHour = (dateString: string) => {
  const targetDate = new Date(dateString);
  const currentDate = new Date();
  const oneHourAgo = new Date(currentDate.getTime() - 60 * 60 * 1000);
  return targetDate > oneHourAgo;
};

const postToDiscord = (webhookURL: string, content: string): void => {
  const payload: DiscordWebhookPayload = {
    // https://discord.com/developers/docs/resources/channel#message-object-message-flags
    flags: 1 << 12,
    content: content,
  };
  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
  };
  UrlFetchApp.fetch(webhookURL, options);
};
