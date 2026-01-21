import { openDB, type DBSchema } from 'idb';

import type { CustomEmoji, Status } from './mastodon-entities';

export
interface OverviewEntry {
  key: string;
  instance: string;
  id: string;
  lastRequestDate: Date;
  lastRetrievalDate?: Date;
  seenIds: Set<string>;
  rootAuthor?: string;
  rootAuthorAvatar?: string;
  rootAccountEmojis?: CustomEmoji[];
  rootAcct?: string;
  teaser?: string;
  rootCreatedAt?: Date;
  lastCreatedAt?: Date;
  nToots?: number;
  nUnseen?: number;
};

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

const dbVersion = 3;

export default openDB<Schema>("followToots", dbVersion, {
  async upgrade(db, oldVersion, _newVersion, tx) {
    if (oldVersion < 1) {
      [...db.objectStoreNames].forEach(name => db.deleteObjectStore(name));
      db.createObjectStore("treeOverview", {keyPath: "key"});
      db.createObjectStore("treeDetails", {keyPath: "key"});
      db.createObjectStore("config", {keyPath: "key"});
      db.createObjectStore("accessTokens", {keyPath: "instance"});
    }
    if (oldVersion < 3) {
      const overviewStore = tx.objectStore("treeOverview");
      for (const o of await overviewStore.getAll()) {
        await overviewStore.put(Object.assign({seenIds: (o as any).closedIds ?? o.seenIds ?? new Set()}, o));
      }
    }
  },
});
