import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorldPress } from "@/lib/news";

// `news.ts` habla con APIs externas. Aquí se sustituye `fetch` por un doble y se
// prueba lo que sí es lógica propia: el parseo del RSS de Google Noticias, el
// colador por país, el descarte de redes sociales, la deduplicación y el límite.
// El resto del archivo (GDELT, GNews, traducción, cifras de crisis, caché en
// disco) queda documentado en el informe como no cubierto.

function item(over: Partial<Record<"title" | "link" | "source" | "pubDate", string>> = {}): string {
  const { title = "Sismo en Venezuela deja daños - Reuters", link = "https://ejemplo.test/1", source = "Reuters", pubDate = "Wed, 24 Jun 2026 10:00:00 GMT" } = over;
  return `<item><title>${title}</title><link>${link}</link><source url="https://x">${source}</source><pubDate>${pubDate}</pubDate></item>`;
}

function rss(items: string[]): string {
  return `<rss><channel><title>Canal</title>${items.join("")}</channel></rss>`;
}

function responderCon(xml: string, ok = true) {
  const fetchDoble = vi.fn(async (...args: unknown[]) => {
    void args;
    return { ok, text: async () => xml } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchDoble);
  return fetchDoble;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getWorldPress", () => {
  it("consulta el RSS del país activo con su parámetro gl", async () => {
    const fetchDoble = responderCon(rss([item()]));
    await getWorldPress(5, "co");
    const url = String(fetchDoble.mock.calls[0]![0]);
    expect(url).toContain("news.google.com/rss/search");
    expect(url).toContain("gl=CO");
    expect(url).toContain(encodeURIComponent("Colombia"));
  });

  it("extrae titular, medio, enlace y fecha ISO", async () => {
    responderCon(rss([item()]));
    const [articulo] = await getWorldPress(5, "ve");
    expect(articulo).toMatchObject({
      title: "Sismo en Venezuela deja daños",
      source: "Reuters",
      url: "https://ejemplo.test/1",
      image: null,
    });
    expect(articulo!.publishedAt).toBe("2026-06-24T10:00:00.000Z");
  });

  it("quita el sufijo ' - Fuente' solo cuando coincide con el medio", async () => {
    responderCon(
      rss([
        item({ title: "Terremoto en Caracas - El Nacional", source: "El Nacional", link: "https://a.test/1" }),
        item({ title: "Réplicas en La Guaira - Otro medio", source: "El Nacional", link: "https://a.test/2" }),
      ]),
    );
    const titulos = (await getWorldPress(5, "ve")).map((a) => a.title);
    expect(titulos).toEqual(["Terremoto en Caracas", "Réplicas en La Guaira - Otro medio"]);
  });

  it("descarta lo que no habla del país activo", async () => {
    responderCon(
      rss([
        item({ title: "Sismo en Japón - NHK", source: "NHK", link: "https://a.test/1" }),
        item({ title: "Rescates en Caracas - Reuters", source: "Reuters", link: "https://a.test/2" }),
      ]),
    );
    const res = await getWorldPress(5, "ve");
    expect(res.map((a) => a.url)).toEqual(["https://a.test/2"]);
  });

  it("descarta fuentes de redes sociales", async () => {
    responderCon(
      rss([
        item({ title: "Video del sismo en Venezuela - YouTube", source: "YouTube", link: "https://a.test/1" }),
        item({ title: "Hilo del sismo en Venezuela - X.com", source: "X.com", link: "https://a.test/2" }),
      ]),
    );
    expect(await getWorldPress(5, "ve")).toEqual([]);
  });

  it("deduplica por enlace y respeta el límite", async () => {
    responderCon(
      rss([
        item({ link: "https://a.test/1" }),
        item({ link: "https://a.test/1" }),
        item({ link: "https://a.test/2" }),
        item({ link: "https://a.test/3" }),
      ]),
    );
    expect((await getWorldPress(10, "ve")).map((a) => a.url)).toEqual([
      "https://a.test/1",
      "https://a.test/2",
      "https://a.test/3",
    ]);
    responderCon(rss([item({ link: "https://b.test/1" }), item({ link: "https://b.test/2" })]));
    expect(await getWorldPress(1, "ve")).toHaveLength(1);
  });

  it("decodifica entidades XML y CDATA del titular", async () => {
    responderCon(
      rss([item({ title: "<![CDATA[Caracas &amp; La Guaira: &#39;sin agua&#39;]]>", source: "Reuters" })]),
    );
    const [articulo] = await getWorldPress(5, "ve");
    expect(articulo!.title).toBe("Caracas & La Guaira: 'sin agua'");
  });

  it("ignora entradas sin enlace o sin titular", async () => {
    responderCon(
      rss([
        "<item><title>Sismo en Venezuela</title><source>Reuters</source></item>",
        "<item><link>https://a.test/9</link><source>Reuters</source></item>",
      ]),
    );
    expect(await getWorldPress(5, "ve")).toEqual([]);
  });

  it("sin fecha de publicación deja publishedAt en null", async () => {
    responderCon(rss([item({ pubDate: "" })]));
    expect((await getWorldPress(5, "ve"))[0]!.publishedAt).toBeNull();
  });

  it("si la API responde mal o falla, devuelve lista vacía en vez de romper la página", async () => {
    responderCon(rss([item()]), false);
    expect(await getWorldPress(5, "ve")).toEqual([]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    expect(await getWorldPress(5, "ve")).toEqual([]);
  });
});
