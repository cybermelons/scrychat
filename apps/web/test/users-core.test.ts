import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { userIdFromEmail, userPaths, chatFileFor, deckEventFor, migrateLegacy } from "../src/users-core.js";

describe("userIdFromEmail", () => {
  it("lowercases and accepts normal emails", () => {
    expect(userIdFromEmail(" Foo.Bar+x@Ex.com ")).toBeNull(); // + is outside [a-z0-9@._-]
    expect(userIdFromEmail("Foo.Bar@Ex.com")).toBe("foo.bar@ex.com");
  });
  it("rejects traversal, separators, hidden, empty, non-strings", () => {
    for (const bad of ["", "..", ".", ".hidden@x.com", "a/b@x.com", "a\\b", "a b@x.com", "a\0b", "é@x.com", 5, null, undefined]) {
      expect(userIdFromEmail(bad)).toBeNull();
    }
  });
});

describe("userPaths / chatFileFor", () => {
  it("builds paths under users/<id>", () => {
    const p = userPaths("/u", "a@b.c");
    expect(p.root).toBe("/u/a@b.c");
    expect(p.decks).toBe("/u/a@b.c/decks");
    expect(p.collection).toBe("/u/a@b.c/collection.json");
  });
  it("throws on unsafe ids", () => {
    expect(() => userPaths("/u", "../x")).toThrow();
    expect(() => userPaths("/u", "A@B.C")).toThrow(); // must already be sanitized
  });
  it("chat ids resolve only inside the given chats dir", () => {
    expect(chatFileFor("/u/a/chats", "123-abc")).toBe("/u/a/chats/123-abc.json");
    expect(() => chatFileFor("/u/a/chats", "../b/chats/1")).toThrow();
    expect(() => chatFileFor("/u/a/chats", "")).toThrow();
  });
  it("another user's chat id is not found in my dir", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sc-users-"));
    const a = userPaths(root, "a@x.com");
    const b = userPaths(root, "b@x.com");
    fs.mkdirSync(a.chats, { recursive: true });
    fs.mkdirSync(b.chats, { recursive: true });
    fs.writeFileSync(chatFileFor(a.chats, "111-aaa"), "{}");
    expect(fs.existsSync(chatFileFor(b.chats, "111-aaa"))).toBe(false);
    fs.rmSync(root, { recursive: true });
  });
});

describe("deckEventFor (SSE path filter)", () => {
  const sep = path.sep;
  const j = (...p: string[]) => p.join(sep);
  it("passes only the caller's deck files", () => {
    expect(deckEventFor("a@x.com", j("a@x.com", "decks", "foo.json"))).toBe("foo");
    expect(deckEventFor("a@x.com", j("b@x.com", "decks", "foo.json"))).toBeNull();
    expect(deckEventFor("a@x.com", j("a@x.com", "chats", "foo.json"))).toBeNull();
    expect(deckEventFor("a@x.com", j("a@x.com", "decks", ".tmp-foo.json-1"))).toBeNull();
    expect(deckEventFor("a@x.com", j("a@x.com", "decks", "foo.txt"))).toBeNull();
    expect(deckEventFor("a@x.com", j("a@x.com", "decks", "sub", "foo.json"))).toBeNull();
    expect(deckEventFor("a@x.com", null)).toBeNull();
  });
  it("a prefix-sharing id does not leak", () => {
    expect(deckEventFor("a@x.com", j("a@x.com.evil", "decks", "foo.json"))).toBeNull();
  });
});

describe("migrateLegacy", () => {
  const mk = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sc-mig-"));
    fs.mkdirSync(path.join(root, "legacy/decks"), { recursive: true });
    fs.mkdirSync(path.join(root, "legacy/chats"));
    fs.writeFileSync(path.join(root, "legacy/decks/d.json"), "{}");
    fs.writeFileSync(path.join(root, "legacy/chats/1-a.json"), "{}");
    fs.writeFileSync(path.join(root, "legacy/collection.json"), "{}");
    return root;
  };
  it("copies legacy data into users/<owner> once and keeps the originals", () => {
    const root = mk();
    const users = path.join(root, "users");
    expect(migrateLegacy(path.join(root, "legacy"), users, "o@x.com")).toEqual(["decks", "chats", "collection.json"]);
    expect(fs.existsSync(path.join(users, "o@x.com/decks/d.json"))).toBe(true);
    expect(fs.existsSync(path.join(users, "o@x.com/chats/1-a.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "legacy/decks/d.json"))).toBe(true);
    expect(fs.readdirSync(users)).toEqual(["o@x.com"]); // no temp dir left
    expect(migrateLegacy(path.join(root, "legacy"), users, "o@x.com")).toBeNull(); // second run: no-op
    fs.rmSync(root, { recursive: true });
  });
  it("does nothing without legacy decks/ or when the owner dir exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sc-mig-"));
    expect(migrateLegacy(path.join(root, "none"), path.join(root, "users"), "o@x.com")).toBeNull();
    expect(fs.existsSync(path.join(root, "users"))).toBe(false);
    const r2 = mk();
    fs.mkdirSync(path.join(r2, "users/o@x.com"), { recursive: true });
    expect(migrateLegacy(path.join(r2, "legacy"), path.join(r2, "users"), "o@x.com")).toBeNull();
    expect(fs.readdirSync(path.join(r2, "users/o@x.com"))).toEqual([]);
    fs.rmSync(root, { recursive: true });
    fs.rmSync(r2, { recursive: true });
  });
});
