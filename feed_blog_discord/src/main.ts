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

const businessUrls: Array<string> = [
  "https://techcrunch.com/feed/",
  "https://www.google.co.jp/alerts/feeds/12342435434000837131/13834124633392104991", // シリーズA
  "https://www.google.co.jp/alerts/feeds/12342435434000837131/13591642610062866245", // 資金調達
  "https://businessnetwork.jp/article/feed/",
  "https://toyokeizai.net/list/feed/rss",
  "https://b.hatena.ne.jp/hotentry/all.rss",
  "https://feeds.dailyfeed.jp/feed/103.rss",
  "https://feeds.dailyfeed.jp/feed/s/22/348.rss",
];

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

  const messages = fulfilledResults.flatMap(({ value }) => {
    switch (value.kind) {
      case "RSS 1.0":
        return parseRSS1(value);
      case "RSS 2.0":
        return parseRSS2(value);
      default:
        return parseAtom(value);
    }
  });

  messages
    .filter((m) => m)
    .forEach((message) => {
      postToDiscord(webhookURL, message);
      Utilities.sleep(1000);
    });

  // const errorWebhookURL = PropertiesService.getScriptProperties().getProperty(
  //   "DISCORD_WEBHOOK_URL_ERROR"
  // );
  // if (!errorWebhookURL) return;
  // const rejectedResults = results.filter(
  //   (r) => r.status === "rejected"
  // ) as PromiseRejectedResult[];
  // rejectedResults
  //   .map((r) => r.reason.message)
  //   .filter((m) => m)
  //   .forEach((message) => {
  //     postToDiscord(errorWebhookURL, message);
  //     Utilities.sleep(1000);
  //   });
};

const fetchFeedWithType = async (url: string): Promise<FetchResult> => {
  const root = (() => {
    try {
      const response = UrlFetchApp.fetch(url, {
        contentType: "application/xml; charset=utf-8",
      });
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

const parseRSS2 = ({ root, url }: FetchResult): Array<string> => {
  try {
    const channel = root.getChild("channel");
    const title = channel.getChildText("title");
    const items = channel.getChildren("item");
    const newItems = items.filter((item) =>
      isNew(item.getChildText("pubDate"))
    );
    if (!newItems.length) return [];
    return [`## [${title}](<${url}>)\n\n`]
      .concat(
        newItems.map((item) => {
          const title = item.getChildText("title");
          const link = item.getChildText("link");
          return `### ・[${title}](<${link}>)\n`;
        })
      )
      .concat(["\n\n\n"]);
  } catch {
    return [`parse error (<${url}>)`];
  }
};

const parseRSS1 = ({ root, url }: FetchResult): Array<string> => {
  try {
    const channel = root.getChild("channel", root.getNamespace(""));
    const title = channel.getChildText("title", root.getNamespace(""));
    const items = root.getChildren(
      "item",
      XmlService.getNamespace("http://purl.org/rss/1.0/")
    );
    const newItems = items.filter((item) =>
      isNew(
        item.getChildText(
          "date",
          XmlService.getNamespace("http://purl.org/dc/elements/1.1/")
        )
      )
    );
    if (!newItems.length) return [];
    return [`## [${title}](<${url}>)\n\n`]
      .concat(
        newItems.map((item) => {
          const title = item.getChildText(
            "title",
            XmlService.getNamespace("http://purl.org/rss/1.0/")
          );
          const link = item.getChildText(
            "link",
            XmlService.getNamespace("http://purl.org/rss/1.0/")
          );
          return `### ・[${title}](<${link}>)\n`;
        })
      )
      .concat(["\n\n\n"]);
  } catch {
    return [`parse error (<${url}>)`];
  }
};

const parseAtom = ({ root, url }: FetchResult): Array<string> => {
  try {
    const title = root.getChildText("title", root.getNamespace());
    const items = root.getChildren("entry", root.getNamespace());
    const newItems = items.filter((item) =>
      isNew(item.getChildText("updated", root.getNamespace()))
    );
    if (!newItems.length) return [];
    return [`## [${title}](<${url}>)\n\n`]
      .concat(
        newItems.map((item) => {
          const title = item.getChildText("title", root.getNamespace());
          const linkElement = item.getChild("link", root.getNamespace());
          const link = linkElement.getAttribute("href")
            ? linkElement.getAttribute("href").getValue()
            : linkElement.getText();

          return `### ・[${title}](<${link}>)\n`;
        })
      )
      .concat(["\n\n\n"]);
  } catch {
    return [`parse error (<${url}>)`];
  }
};

const isNew = (dateString: string) => {
  const targetDate = new Date(dateString);
  const currentDate = new Date();
  const oneHourAgo = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);
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
