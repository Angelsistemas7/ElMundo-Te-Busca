import { describe, expect, it } from "vitest";
import { isTweetUrl } from "@/lib/socialEmbed";

describe("isTweetUrl", () => {
  it("reconoce enlaces a un tuit en x.com y twitter.com (con o sin www)", () => {
    expect(isTweetUrl("https://x.com/usuario/status/1234567890")).toBe(true);
    expect(isTweetUrl("https://twitter.com/usuario/status/1234567890")).toBe(true);
    expect(isTweetUrl("https://www.x.com/usuario/status/1234567890?s=20")).toBe(true);
    expect(isTweetUrl("http://twitter.com/usuario/status/1")).toBe(true);
  });

  it("descarta enlaces de X que no son un tuit concreto", () => {
    expect(isTweetUrl("https://x.com/usuario")).toBe(false);
    expect(isTweetUrl("https://x.com/usuario/status/abc")).toBe(false);
    expect(isTweetUrl("https://x.com/i/lists/123")).toBe(false);
  });

  it("descarta otros dominios, incluidos los que imitan el host", () => {
    expect(isTweetUrl("https://facebook.com/usuario/status/123")).toBe(false);
    expect(isTweetUrl("https://x.com.malicioso.net/usuario/status/123")).toBe(false);
    expect(isTweetUrl("https://mobile.twitter.com/usuario/status/123")).toBe(false);
  });

  it("descarta valores vacios o que no son URL", () => {
    expect(isTweetUrl(null)).toBe(false);
    expect(isTweetUrl(undefined)).toBe(false);
    expect(isTweetUrl("")).toBe(false);
    expect(isTweetUrl("x.com/usuario/status/123")).toBe(false);
  });
});
