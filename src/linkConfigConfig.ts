import type { Status } from "./mastodon-entities";

export
const linkableFeatures = {
  status: "Toot",
  profile: "Profile",
};

export
type LinkableFeature = keyof typeof linkableFeatures;

type ClientLinkConfig = {
  name: (instance: string) => string;
  icon: string;
  urlFunctions: Record<LinkableFeature, (instance: string, status: Status) => string>;
};

export
const linkConfigConfig: Record<string, ClientLinkConfig> = {
  plain: {
    name: instance => instance,
    icon: "https://joinmastodon.org/logos/logo-purple.svg",
    urlFunctions: {
      status: (instance, status) => `https://${instance}/@${status.account.acct}/${status.id}`,
      profile: (instance, status) => `https://${instance}/@${status.account.acct}`,
    }
  },
  phanpy: {
    name: () => "phanpy.social",
    icon: "https://phanpy.social/favicon.ico",
    urlFunctions: {
      status: (instance, status) => `https://phanpy.social/#/${instance}/s/${status.id}`,
      profile: (instance, status) => `https://phanpy.social/#/${instance}/a/${status.account.id}`,
    }
  },
  elk: {
    name: () => "elk.zone",
    icon: "https://elk.zone/favicon.ico",
    urlFunctions: {
      status: (instance, status) =>
        // unfortunately Elk does not automatically scroll to the referenced status
        `https://elk.zone/${instance}/@${status.account.acct}/${status.id}#status-${status.id}`,
      profile: (instance, status) => `https://elk.zone/${instance}/@${status.account.acct}`,
    }
  },
  // TODO support more clients
};
