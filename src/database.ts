import { openDB, type DBSchema } from 'idb';

import type { CustomEmoji, Status } from './mastodon-entities';

export
interface OverviewEntry {
  key: string;
  instance: string;
  id: string;
  lastRequestDate: Date;
  lastRetrievalDate?: Date;
  closedIds: Set<string>;
  rootAuthor?: string;
  rootAuthorAvatar?: string;
  rootAccountEmojis?: CustomEmoji[];
  rootAcct?: string;
  teaser?: string;
  rootCreatedAt?: Date;
  lastCreatedAt?: Date;
  nDescendants?: number;
  nOpen?: number;
  nExpectedDescendants?: number;
};

export
type SubTree = {toot: Status, children: SubTree[]};

export interface DetailEntry {
  key: string;
  root: Status;
  ancestors: Status[];
  descendants: Status[];
}

interface Schema extends DBSchema {
  treeOverview: {
    key: string;
    value: OverviewEntry;
    indexes: {
      byInstance: string;
    };
  };
  treeDetails: {
    key: string;
    value: DetailEntry;
    indexes: {
      byInstance: string;
     };
  };
  accessTokens: {
    key: string;
    value: {
      instance: string;
      token: string;
    }
  }
  config: {
    key: string;
    value: any;
  }
}

const dbVersion = 1;

export default openDB<Schema>("followToots", dbVersion, {
  upgrade(db) {
    [...db.objectStoreNames].forEach(name => db.deleteObjectStore(name));
    db.createObjectStore("treeOverview", {keyPath: "key"});
    db.createObjectStore("treeDetails", {keyPath: "key"});
    db.createObjectStore("config", {keyPath: "key"});
    db.createObjectStore("accessTokens", {keyPath: "instance"});
  },
});
